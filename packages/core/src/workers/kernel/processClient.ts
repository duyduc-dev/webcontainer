import type { ProcessTable } from "../../kernel/processTable";
import { FS_SYNC_CONTROL_LENGTH, FS_SYNC_DATA_BUFFER_SIZE } from "../../kernel/fs/syncWireFormat";
import {
  decodeSyncExecRequest,
  encodeSyncExecResponse,
  SYNC_EXEC_CONTROL_LENGTH,
  SYNC_EXEC_DATA_BUFFER_SIZE,
  SYNC_EXEC_STATE_INDEX,
  SYNC_EXEC_STATE_RESPONDED,
} from "../../kernel/childProcess/syncExecWireFormat";
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

interface StdinPayload {
  processId: string;
  chunk: Uint8Array;
}

interface ProcessClient {
  spawn(payload: SpawnPayload): Promise<{ processId: string }>;
  runShell(payload: ShellExecPayload): Promise<{ output: string; cwd: string }>;
  /** Forwards a chunk written to dwc.process.spawn()'s returned `.stdin`
   * WritableStream (host side) to the real, already-running guest process
   * (apis/Process.ts's createForwardingWritableStream). Silently a no-op
   * for an unknown/already-exited processId, matching how a real Node
   * stream write past its consumer's lifetime is simply unobserved rather
   * than a hard error - the host side already treats this call as
   * fire-and-forget (`.catch(() => {})`). */
  stdin(payload: StdinPayload): void;
}

interface BootProcessPayload {
  entryPath: string;
  argv: string[];
  env: Record<string, string>;
  cwd: string;
}

type ProcessEventHandler = (type: string, eventPayload: any, processId: string) => void;

/** child_process.spawn('node', [...]) is an extremely common real-world
 * pattern (build tools re-invoking themselves), so it gets the exact same
 * resolution `node <script>` already gets in a shell line: a direct entryPath
 * rather than a /bin/node.js lookup (no vendored Node script can require() an
 * arbitrary absolute path the way moduleLoader.run(entryPath) can). Every
 * other command resolves against /bin/<name>.js (kernel/fs/coreutils.ts,
 * seeded at FS Worker boot). Returns null - not a thrown error - so callers
 * (the shell's "command not found" vs. child_process's ENOENT-shaped error)
 * can each report it their own way. */
const resolveEntryPoint = async (
  fsClient: FsClient,
  command: string,
  args: string[],
  cwd: string,
): Promise<{ entryPath: string; args: string[] } | null> => {
  if (command === "node") {
    const scriptArg = args[0];
    if (!scriptArg) return null;
    return { entryPath: resolvePath(cwd, scriptArg), args: args.slice(1) };
  }
  const entryPath = `/bin/${command}.js`;
  const exists = await fsClient.request<boolean>({ action: "exists", path: entryPath });
  return exists ? { entryPath, args } : null;
};

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

/**
 * When cross-origin isolated, gives a new process a dedicated MessageChannel
 * + a pair of SharedArrayBuffers for synchronous child_process.execFileSync()
 * calls - traced need: real rolldown's own WebContainer-detection fallback
 * (see runtime/builtins/module.ts's own doc comment on `process.versions.webcontainer`)
 * does `execFileSync('pnpm', ['i', bindingPkg], { cwd, stdio: 'inherit' })`
 * to fetch its WASM binding, and execFileSync is fully synchronous by real
 * Node's own contract - unlike sync fs (serviced by a separate, always-idle
 * FS Worker with instant in-memory VFS ops), this one is serviced by the
 * KERNEL WORKER'S OWN thread, since running a command to completion means
 * reusing the exact same spawn/boot orchestration `cp-spawn`/`cp-exec`
 * already do - `port2.onmessage` fires synchronously (this thread is never
 * itself blocked; only the REQUESTING process worker blocks, via
 * Atomics.wait, on a completely different thread) but its body is async,
 * awaiting the real spawned program's exit exactly like `runShellInternal`
 * already does for `cp-exec` - the response (and the Atomics.notify wake-up)
 * only happens once that program has actually finished running, which for
 * an install-shaped command can take minutes (see syncExecClient.ts's own
 * timeout).
 */
const createSyncExecChannelFor = (
  fsClient: FsClient,
  processTable: ProcessTable,
  fetcherClient: FetcherClient,
  netRelay: NetRelay,
): { port: MessagePort; control: SharedArrayBuffer; data: SharedArrayBuffer } | null => {
  if (!self.crossOriginIsolated) return null;

  const { port1, port2 } = new MessageChannel();
  const control = new SharedArrayBuffer(SYNC_EXEC_CONTROL_LENGTH * Int32Array.BYTES_PER_ELEMENT);
  const data = new SharedArrayBuffer(SYNC_EXEC_DATA_BUFFER_SIZE);
  const controlView = new Int32Array(control);

  port2.onmessage = () => {
    const request = decodeSyncExecRequest(data);
    void (async () => {
      try {
        const result = await runProgramToCompletion(fsClient, processTable, fetcherClient, netRelay, request);
        encodeSyncExecResponse({ ok: true, exitCode: result.exitCode, output: result.output }, data);
      } catch (error) {
        encodeSyncExecResponse({ ok: false, message: error instanceof Error ? error.message : String(error) }, data);
      }
      Atomics.store(controlView, SYNC_EXEC_STATE_INDEX, SYNC_EXEC_STATE_RESPONDED);
      Atomics.notify(controlView, SYNC_EXEC_STATE_INDEX);
    })();
  };

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
  onWorkerCreated?: (worker: Worker) => void,
): Promise<{ processId: string }> => {
  const { entryPath, argv, env, cwd } = payload;
  const { sources } = await preloadModuleGraph(entryPath, readFileAsText(fsClient));

  const { id: processId } = processTable.register();
  const worker = spawnChildWorker(new URL("../process/worker.js", import.meta.url), {
    name: `Process:${processId}`,
  });
  netRelay.registerWorker(processId, worker);
  processTable.setWorker(processId, worker);
  onWorkerCreated?.(worker);

  // child_process.spawn()'d children of THIS process: tracked by the spawn
  // request id (not processId) so a later "cp-kill" can find the right
  // worker without this process needing to know its child's processId.
  const childWorkersByRequestId = new Map<string, Worker>();

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
      // Also surfaced as a top-level "listen" event (dwc.addEventListener) -
      // traced need: the host page has no other way to learn a guest
      // process just started listening on a port, which dwc.preview's own
      // iframe-preview flow depends on.
      onEvent("listen", { port: eventPayload.port }, processId);
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

    // child_process: this process is asking to spawn a child (an ongoing
    // relay of stdout/stderr/exit events tagged by request id, not a single
    // reply — see workers/process/worker.ts's createChildProcessBridge) or
    // run a shell line (a one-shot buffered result, like net-request/
    // net-response above), or to kill a child it previously spawned.
    if (type === "cp-spawn") {
      const { id, command, args: childArgs, cwd: childCwd, env: childEnv } = eventPayload;
      (async () => {
        try {
          const resolved = await resolveEntryPoint(fsClient, command, childArgs, childCwd);
          if (!resolved) {
            worker.postMessage({ type: "cp-event", payload: { id, kind: "error", message: `${command}: command not found` } });
            return;
          }
          await bootProcess(
            fsClient,
            processTable,
            fetcherClient,
            netRelay,
            { entryPath: resolved.entryPath, argv: resolved.args, env: childEnv ?? {}, cwd: childCwd },
            (childType, childPayload) => {
              if (childType === "stdout" || childType === "stderr") {
                worker.postMessage({ type: "cp-event", payload: { id, kind: childType, chunk: childPayload.chunk } });
                return;
              }
              if (childType === "exit") {
                childWorkersByRequestId.delete(id);
                worker.postMessage({ type: "cp-event", payload: { id, kind: "exit", code: childPayload.code } });
              }
            },
            (childWorker) => childWorkersByRequestId.set(id, childWorker),
          );
        } catch (error) {
          worker.postMessage({
            type: "cp-event",
            payload: { id, kind: "error", message: error instanceof Error ? error.message : String(error) },
          });
        }
      })();
      return;
    }
    if (type === "cp-kill") {
      const childWorker = childWorkersByRequestId.get(eventPayload.id);
      if (!childWorker) return;
      childWorkersByRequestId.delete(eventPayload.id);
      childWorker.terminate();
      // 143 = 128 + SIGTERM(15), the conventional shell exit code for a
      // terminated process — there's no real signal here, just a worker torn
      // down from outside, but ChildProcess's 'exit' handlers still need a code.
      worker.postMessage({ type: "cp-event", payload: { id: eventPayload.id, kind: "exit", code: 143 } });
      return;
    }
    if (type === "cp-exec") {
      const { id, line, cwd: execCwd } = eventPayload;
      runShellInternal(fsClient, processTable, fetcherClient, netRelay, { line, cwd: execCwd }).then(
        (result) => worker.postMessage({ type: "cp-exec-response", payload: { id, ok: true, result } }),
        (error: unknown) =>
          worker.postMessage({
            type: "cp-exec-response",
            payload: { id, ok: false, error: { message: error instanceof Error ? error.message : String(error) } },
          }),
      );
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
  const syncExec = createSyncExecChannelFor(fsClient, processTable, fetcherClient, netRelay);
  const transfer = [...(syncFs ? [syncFs.port] : []), ...(syncExec ? [syncExec.port] : [])];
  postWithTransfer(worker, { type: "boot", payload: { entryPath, sources, argv, env, cwd, syncFs, syncExec } }, transfer);

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

/** child_process.execFileSync()'s own kernel-side counterpart to
 * runProgramViaShell above: same "boot, collect stdout+stderr, wait for
 * exit" shape, but resolving `command`/`args` the same way cp-spawn does
 * (resolveEntryPoint - PATH-style /bin/<name>.js lookup, or the `node
 * <script>` special case) rather than through the shell tokenizer, since
 * execFileSync's whole contract (unlike exec()'s shell line) is running one
 * program with an explicit argv, no shell parsing involved - and threading
 * through `env`, which execFileSync's real options support and cp-exec's
 * shell-line protocol has no field for. Throws (doesn't return null) when
 * the command can't be resolved, matching execFileSync's own real
 * ENOENT-shaped throw. */
const runProgramToCompletion = async (
  fsClient: FsClient,
  processTable: ProcessTable,
  fetcherClient: FetcherClient,
  netRelay: NetRelay,
  payload: { command: string; args: string[]; cwd: string; env: Record<string, string> },
): Promise<{ output: string; exitCode: number }> => {
  const resolved = await resolveEntryPoint(fsClient, payload.command, payload.args, payload.cwd);
  if (!resolved) {
    throw new Error(`${payload.command}: command not found`);
  }

  let output = "";
  let exitCode = 0;
  let resolveExit!: () => void;
  const exited = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  await bootProcess(
    fsClient,
    processTable,
    fetcherClient,
    netRelay,
    { entryPath: resolved.entryPath, argv: resolved.args, env: payload.env, cwd: payload.cwd },
    (type, eventPayload) => {
      if (type === "stdout" || type === "stderr") {
        output += decoder.decode(eventPayload.chunk);
        return;
      }
      if (type === "exit") {
        exitCode = eventPayload.code;
        resolveExit();
      }
    },
  );

  await exited;
  return { output, exitCode };
};

/** Runs an `&&`-chained shell line: `cd` mutates cwd in place (a subprocess
 * can't change its parent's cwd, so it can't be a PATH-resolved program like
 * everything else); every other command (including `node`) resolves via
 * resolveEntryPoint() and runs the same way. Stops the chain (real `&&`
 * semantics) as soon as a command exits non-zero. Module-level (not a
 * createProcessClient() closure) so bootProcess()'s "cp-exec" handling -
 * child_process.exec() from guest code - can call it directly; the returned
 * exitCode is internal-only (createProcessClient()'s public runShell() below
 * strips it to keep dwc.shell.exec()'s existing {output, cwd} contract). */
const runShellInternal = async (
  fsClient: FsClient,
  processTable: ProcessTable,
  fetcherClient: FetcherClient,
  netRelay: NetRelay,
  payload: ShellExecPayload,
): Promise<{ output: string; cwd: string; exitCode: number }> => {
  let cwd = payload.cwd ?? "/";
  const commands = parseCommands(tokenize(payload.line));
  let output = "";
  let exitCode = 0;

  for (const command of commands) {
    const name = command.argv[0];
    if (!name) continue;

    if (name === "cd") {
      const target = command.argv[1] ? resolvePath(cwd, command.argv[1]) : "/";
      const stat = await fsClient.request<{ isDirectory: boolean }>({ action: "stat", path: target });
      if (!stat.isDirectory) throw new Error(`cd: not a directory: ${command.argv[1]}`);
      cwd = target;
      exitCode = 0;
      continue;
    }

    if (name === "node" && !command.argv[1]) throw new Error("node: missing script operand");

    const resolved = await resolveEntryPoint(fsClient, name, command.argv.slice(1), cwd);
    if (!resolved) throw new Error(`${name}: command not found`);

    const result = await runProgramViaShell(resolved.entryPath, resolved.args, cwd, fsClient, processTable, fetcherClient, netRelay);
    exitCode = result.exitCode;

    if (command.redirectOut) {
      await fsClient.request({ action: "writeFile", path: resolvePath(cwd, command.redirectOut), contents: result.output });
    } else {
      output += result.output;
    }

    if (exitCode !== 0) break;
  }

  return { output, cwd, exitCode };
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
        return;
      }
      if (type === "listen") {
        // Global, not scoped to processId - matches dwc.addEventListener's
        // documented `{ port }` contract (a host page cares that SOMETHING
        // is listening on a port, not which spawn() call produced it).
        postEvent("listen", { port: eventPayload.port });
      }
    });
  };

  const runShell = async (payload: ShellExecPayload): Promise<{ output: string; cwd: string }> => {
    const { output, cwd } = await runShellInternal(fsClient, processTable, fetcherClient, netRelay, payload);
    return { output, cwd };
  };

  const stdin = (payload: StdinPayload): void => {
    processTable.getWorker(payload.processId)?.postMessage({ type: "stdin", payload: { chunk: payload.chunk } });
  };

  return { spawn, runShell, stdin };
};

export { createProcessClient };
export type { ProcessClient, ShellExecPayload, SpawnPayload, StdinPayload };
