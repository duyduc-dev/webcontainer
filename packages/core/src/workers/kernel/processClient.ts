import type { ProcessTable } from "../../kernel/processTable";
import { FS_SYNC_CONTROL_LENGTH, FS_SYNC_DATA_BUFFER_SIZE } from "../../kernel/fs/syncWireFormat";
import { DWCError, ERR_INTERNAL } from "../../protocol/errors";
import { postWithTransfer } from "../../protocol/transfer";
import { preloadModuleGraph } from "../../runtime/preload";
import { resolvePath } from "../../shell/resolvePath";
import { parseCommands, tokenize } from "../../shell/tokenize";
import type { FetcherClient, NetRequestPayload } from "./fetcherClient";
import type { FsClient } from "./fsClient";
import type { NetRelay } from "./netRelay";
import { postEvent } from "./service";
import { spawnChildWorker } from "./spawn";

interface SpawnPayload {
  entryPath: string;
  argv?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface ShellExecPayload {
  line: string;
  cwd?: string;
}

interface ProcessClient {
  spawn(payload: SpawnPayload): Promise<{ processId: string }>;
  runShell(payload: ShellExecPayload): Promise<{ output: string; cwd: string }>;
}

interface BootProcessPayload {
  entryPath: string;
  argv: string[];
  env: Record<string, string>;
  cwd: string;
}

type ProcessEventHandler = (type: string, eventPayload: any, processId: string) => void;

const decoder = new TextDecoder();

const readFileAsText = (fsClient: FsClient) => async (path: string): Promise<string> => {
  const bytes = await fsClient.request<Uint8Array>({ action: "readFile", path });
  return decoder.decode(bytes);
};

/**
 * When cross-origin isolated, gives a new process a dedicated MessageChannel + a pair
 * of SharedArrayBuffers to the FS Worker for synchronous fs calls (fs.*Sync). The FS
 * Worker gets its half via fsClient.attachSyncChannel(); this only wires up the port,
 * it never touches the buffers itself.
 */
const createSyncFsChannelFor = (fsClient: FsClient): { port: MessagePort; control: SharedArrayBuffer; data: SharedArrayBuffer } | null => {
  if (!self.crossOriginIsolated) return null;

  const { port1, port2 } = new MessageChannel();
  const control = new SharedArrayBuffer(FS_SYNC_CONTROL_LENGTH * Int32Array.BYTES_PER_ELEMENT);
  const data = new SharedArrayBuffer(FS_SYNC_DATA_BUFFER_SIZE);

  fsClient.attachSyncChannel({ port: port2, control, data });

  return { port: port1, control, data };
};

/** Forwards a spawned process's outbound "net-request" messages to the Fetcher
 * Worker (via the kernel's fetcherClient) and relays the reply back as a
 * "net-response" — the process worker has no channel of its own to the
 * network, only this bidirectional link back to whoever spawned it. */
const forwardNetRequest = (worker: Worker, fetcherClient: FetcherClient, eventPayload: { id: string; [key: string]: unknown }): void => {
  const { id: netId, ...netPayload } = eventPayload;
  fetcherClient
    .request(netPayload as unknown as NetRequestPayload)
    .then((result) => worker.postMessage({ type: "net-response", payload: { id: netId, ok: true, result } }))
    .catch((error: unknown) => {
      const code = error instanceof DWCError ? error.code : ERR_INTERNAL;
      const message = error instanceof Error ? error.message : String(error);
      worker.postMessage({ type: "net-response", payload: { id: netId, ok: false, error: { code, message } } });
    });
};

/**
 * Preloads the require() graph via the FS worker, spawns a fresh Process
 * Worker, and boots `payload.entryPath` in it — the one mechanism shared by
 * `spawn()` (streams events to the bridge) and `node <script>` run through
 * the shell (collects them into one final result instead). `onEvent` fires
 * for every non-net-request message (stdout/stderr/exit); processTable
 * bookkeeping and worker teardown for "exit" already happened by the time it
 * fires.
 */
const bootProcess = async (
  fsClient: FsClient,
  processTable: ProcessTable,
  fetcherClient: FetcherClient,
  netRelay: NetRelay,
  payload: BootProcessPayload,
  onEvent: ProcessEventHandler,
): Promise<{ processId: string }> => {
  const { entryPath, argv, env, cwd } = payload;
  const { sources } = await preloadModuleGraph(entryPath, readFileAsText(fsClient));

  const { id: processId } = processTable.register();
  const worker = spawnChildWorker(new URL("../process/worker.js", import.meta.url), {
    name: `Process:${processId}`,
  });
  netRelay.registerWorker(processId, worker);

  worker.onmessage = (event: MessageEvent<{ type: string; payload?: any }>) => {
    const { type, payload: eventPayload } = event.data;

    if (type === "net-request") {
      forwardNetRequest(worker, fetcherClient, eventPayload);
      return;
    }

    // Cross-process net: this process either registered a port/path (fire-
    // and-forget) or is dialing one (net-pipe-connect gets a synchronous
    // local-registry answer back as net-pipe-connect-response), or is
    // relaying bytes/EOF/close over an already-established connection.
    if (type === "net-listen") {
      netRelay.listen(processId, eventPayload.port);
      return;
    }
    if (type === "net-close-server") {
      netRelay.closeServer(eventPayload.port);
      return;
    }
    if (type === "net-pipe-listen") {
      netRelay.pipeListen(processId, eventPayload.key);
      return;
    }
    if (type === "net-pipe-close-server") {
      netRelay.pipeCloseServer(eventPayload.key);
      return;
    }
    if (type === "net-pipe-connect") {
      const connId = netRelay.pipeConnect(processId, eventPayload.key);
      worker.postMessage({ type: "net-pipe-connect-response", payload: { id: eventPayload.id, connId } });
      return;
    }
    if (type === "net-pipe-relay") {
      netRelay.relay(processId, eventPayload);
      return;
    }

    if (type === "exit") {
      processTable.remove(processId);
      netRelay.unregisterWorker(processId);
      worker.terminate();
    }

    onEvent(type, eventPayload, processId);
  };

  const syncFs = createSyncFsChannelFor(fsClient);
  const transfer = syncFs ? [syncFs.port] : [];
  postWithTransfer(worker, { type: "boot", payload: { entryPath, sources, argv, env, cwd, syncFs } }, transfer);

  return { processId };
};

/** Runs one resolved program (a real script path — `/bin/<name>.js` or a
 * `node <script>` entry) to completion via the same bootProcess() path
 * spawn() uses (so require('https')/etc. work identically), collecting
 * stdout+stderr into one output string and reporting the exit code, matching
 * shell.exec()'s buffered, `&&`-short-circuiting contract. A script that
 * never exits (e.g. a server) never resolves here — same as any other
 * exec()'d command; use spawn() for anything long-running. */
const runProgramViaShell = async (
  entryPath: string,
  argv: string[],
  cwd: string,
  fsClient: FsClient,
  processTable: ProcessTable,
  fetcherClient: FetcherClient,
  netRelay: NetRelay,
): Promise<{ output: string; exitCode: number }> => {
  let output = "";
  let exitCode = 0;
  let resolveExit!: () => void;
  const exited = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  await bootProcess(fsClient, processTable, fetcherClient, netRelay, { entryPath, argv, env: {}, cwd }, (type, eventPayload) => {
    if (type === "stdout" || type === "stderr") {
      output += decoder.decode(eventPayload.chunk);
      return;
    }
    if (type === "exit") {
      exitCode = eventPayload.code;
      resolveExit();
    }
  });

  await exited;
  return { output, exitCode };
};

/** Preloads the require() graph via the FS worker, then spawns a Process Worker to run it. */
const createProcessClient = (
  fsClient: FsClient,
  processTable: ProcessTable,
  fetcherClient: FetcherClient,
  netRelay: NetRelay,
): ProcessClient => {
  const spawn = async (payload: SpawnPayload): Promise<{ processId: string }> => {
    const { entryPath, argv = [], env = {}, cwd = "/" } = payload;

    return bootProcess(fsClient, processTable, fetcherClient, netRelay, { entryPath, argv, env, cwd }, (type, eventPayload, processId) => {
      if (type === "stdout" || type === "stderr") {
        postEvent(`process:${type}`, { processId, chunk: eventPayload.chunk });
        return;
      }
      if (type === "exit") {
        postEvent("process:exit", { processId, code: eventPayload.code });
      }
    });
  };

  /** Runs an `&&`-chained shell line: `cd` mutates cwd in place (a subprocess
   * can't change its parent's cwd, so it can't be a PATH-resolved program
   * like everything else); `node <script>` reuses today's direct-entryPath
   * special case (a coreutils program can't easily require() an arbitrary
   * absolute path the way moduleLoader.run(entryPath) can); every other
   * command resolves against /bin/<name>.js (see kernel/fs/coreutils.ts,
   * seeded at FS Worker boot) and runs the same way. Stops the chain (real
   * `&&` semantics) as soon as a command exits non-zero. */
  const runShell = async (payload: ShellExecPayload): Promise<{ output: string; cwd: string }> => {
    let cwd = payload.cwd ?? "/";
    const commands = parseCommands(tokenize(payload.line));
    let output = "";

    for (const command of commands) {
      const name = command.argv[0];
      if (!name) continue;

      if (name === "cd") {
        const target = command.argv[1] ? resolvePath(cwd, command.argv[1]) : "/";
        const stat = await fsClient.request<{ isDirectory: boolean }>({ action: "stat", path: target });
        if (!stat.isDirectory) throw new Error(`cd: not a directory: ${command.argv[1]}`);
        cwd = target;
        continue;
      }

      let entryPath: string;
      let args: string[];
      if (name === "node") {
        const scriptArg = command.argv[1];
        if (!scriptArg) throw new Error("node: missing script operand");
        entryPath = resolvePath(cwd, scriptArg);
        args = command.argv.slice(2);
      } else {
        entryPath = `/bin/${name}.js`;
        const exists = await fsClient.request<boolean>({ action: "exists", path: entryPath });
        if (!exists) throw new Error(`${name}: command not found`);
        args = command.argv.slice(1);
      }

      const { output: cmdOutput, exitCode } = await runProgramViaShell(entryPath, args, cwd, fsClient, processTable, fetcherClient, netRelay);

      if (command.redirectOut) {
        await fsClient.request({ action: "writeFile", path: resolvePath(cwd, command.redirectOut), contents: cmdOutput });
      } else {
        output += cmdOutput;
      }

      if (exitCode !== 0) break;
    }

    return { output, cwd };
  };

  return { spawn, runShell };
};

export { createProcessClient };
export type { ProcessClient, ShellExecPayload, SpawnPayload };
