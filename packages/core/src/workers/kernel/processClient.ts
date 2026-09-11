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

// Mirrors bindings/net.ts's own private tcpXKey()/portFromTcpXKey() exactly -
// duplicated rather than imported since net.ts doesn't export them (an
// internal encoding detail of that file), but the format is a stable,
// load-bearing wire contract between the two sides either way (see
// previewRelay.ts's own copy of the same encoding).
const TCP_XKEY_PREFIX = "\u0000dwc-tcp:";
const portFromTcpXKey = (key: string): number | null =>
  key.startsWith(TCP_XKEY_PREFIX) ? Number(key.slice(TCP_XKEY_PREFIX.length)) : null;

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

interface ShellSpawnPayload {
  line: string;
  cwd?: string;
  env?: Record<string, string>;
}

interface ShellKillPayload {
  shellId: string;
}

interface StdinPayload {
  processId: string;
  chunk: Uint8Array;
}

interface KillPayload {
  processId: string;
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
  /** Terminates an already-running process's Worker immediately and reports
   * a normal-shaped exit (code 143, matching cp-kill's own convention for a
   * killed child) - the host-facing counterpart to a real Node child's
   * `.kill()`. Silently a no-op for an unknown/already-exited processId,
   * same fire-and-forget shape as `stdin` above. */
  kill(payload: KillPayload): void;
  /** Streaming counterpart to runShell() above: same `&&`-chained-line/`cd`-
   * mutates-cwd/PATH-resolved-command interpreter (reuses runShellLineStreamed,
   * already built for child_process.spawn('sh', ['-c', ...]) from guest code),
   * but relays stdout/stderr/exit as `shell:*` events AS PRODUCED instead of
   * buffering into one string - lets a host page show real progress for a
   * long-running line like `npm install` instead of a silent wait until it
   * finishes. Returns a shellId immediately; the line keeps running across
   * however many commands the chain has after this resolves. */
  spawnShell(payload: ShellSpawnPayload): Promise<{ shellId: string }>;
  /** Terminates whichever command is CURRENTLY running under this shellId
   * (a `&&` chain may have moved through several by the time this is called)
   * and reports a normal-shaped exit (code 143, matching kill() above).
   * Silently a no-op for an unknown/already-finished shellId. */
  killShell(payload: ShellKillPayload): void;
}

interface BootProcessPayload {
  entryPath: string;
  argv: string[];
  env: Record<string, string>;
  cwd: string;
}

type ProcessEventHandler = (type: string, eventPayload: any, processId: string) => void;

/** Resolves a PATH/coreutils-lookup candidate to its real, symlink-free
 * path before it's used as a module's own entryPath - real npm's own bin-
 * linking (how a fetched package like `create-vite` ends up resolvable via
 * PATH search at all) creates `node_modules/.bin/<name>` as a real symlink
 * pointing INTO the package's own directory, and real Node's module
 * resolution uses the symlink's REAL target directory (not the symlink's
 * own location) as the base for that module's relative require()s, unless
 * `--preserve-symlinks` is set. Skipping this left a bin-linked entry
 * point's own relative requires (`require('./dist/index.js')`, its most
 * common shape) resolving against the WRONG directory - confirmed live via
 * a real `npm create vite@latest` run: "Cannot find module './dist/
 * index.js' from '.../node_modules/.bin/create-vite'", the symlink's own
 * directory, not `node_modules/create-vite/` where that file actually
 * lives. Falls back to the original candidate on a realpath failure (this
 * function is only ever called right after confirming the candidate
 * exists, so a failure here would be a genuinely unexpected VFS error, not
 * a normal "not found" case worth hiding a resolved entryPath over). */
const resolveRealEntryPath = async (fsClient: FsClient, candidate: string): Promise<string> => {
  try {
    return await fsClient.request<string>({ action: "realpath", path: candidate });
  } catch {
    return candidate;
  }
};

/** child_process.spawn('node', [...]) is an extremely common real-world
 * pattern (build tools re-invoking themselves), so it gets the exact same
 * resolution `node <script>` already gets in a shell line: a direct entryPath
 * rather than a /bin/node.js lookup (no vendored Node script can require() an
 * arbitrary absolute path the way moduleLoader.run(entryPath) can). Every
 * other command first resolves against /bin/<name>.js (kernel/fs/
 * coreutils.ts, seeded at FS Worker boot), falling back to a real PATH
 * search (a colon-delimited `env.PATH`, first match wins, matching POSIX
 * execvp) when a caller has an env to search with - needed for anything
 * resolved via npm's own bin-linking (node_modules/.bin/<name>, or an npx
 * cache dir's own bin path), which never lives under /bin/. Returns null -
 * not a thrown error - so callers (the shell's "command not found" vs.
 * child_process's ENOENT-shaped error) can each report it their own way. */
const resolveEntryPoint = async (
  fsClient: FsClient,
  command: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<{ entryPath: string; args: string[] } | null> => {
  if (command === "node") {
    const scriptArg = args[0];
    if (!scriptArg) return null;
    return { entryPath: resolvePath(cwd, scriptArg), args: args.slice(1) };
  }
  // A command containing a path separator (`./foo`, `/bin/foo`,
  // `node_modules/.bin/foo`, ...) is used exactly as given, real-shell-
  // style - never PATH-searched, real coreutils/PATH lookup below is only
  // for a bare command word.
  if (command.includes("/")) {
    const entryPath = resolvePath(cwd, command);
    const exists = await fsClient.request<boolean>({ action: "exists", path: entryPath });
    return exists ? { entryPath: await resolveRealEntryPath(fsClient, entryPath), args } : null;
  }
  const builtin = `/bin/${command}.js`;
  if (await fsClient.request<boolean>({ action: "exists", path: builtin })) {
    return { entryPath: builtin, args };
  }
  // Real PATH search, first match wins (matching POSIX execvp) - needed for
  // anything resolved via npm's own bin-linking (node_modules/.bin/<name>,
  // or an npx cache dir's own bin path), which never lives under /bin/.
  const pathVar = env?.PATH ?? env?.Path ?? "";
  for (const dir of pathVar.split(":")) {
    if (!dir) continue;
    const candidate = resolvePath(cwd, `${dir}/${command}`);
    if (await fsClient.request<boolean>({ action: "exists", path: candidate })) {
      return { entryPath: await resolveRealEntryPath(fsClient, candidate), args };
    }
  }
  return null;
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

    // worker_threads.Worker's own nested-Worker bootstrap (workers/
    // workerThreads/worker.ts) needs a real sync-fs channel to this
    // project's own VFS, same as this process itself got at spawn time -
    // createSyncFsChannelFor(fsClient) is already a standalone, repeatable
    // helper (not coupled 1:1 to the process table), so granting a SECOND
    // one to an already-running process is just calling it again, not a
    // redesign. See runtime/builtins/worker_threads.ts's `spawnWorker`
    // (worker.ts's own wiring) for the requesting side.
    if (type === "wt-request-sync-fs-channel") {
      const { id } = eventPayload as { id: string };
      const syncFs = createSyncFsChannelFor(fsClient);
      worker.postMessage({ type: "wt-sync-fs-channel-response", payload: { id, syncFs } }, syncFs ? [syncFs.port] : []);
      return;
    }

    // fs.watch() (see runtime/builtins/fs.ts) - the guest process has no
    // channel of its own to the FS Worker's watch registry, only this
    // relay through the kernel (fsClient.request), same shape as every
    // other guest<->FS-Worker op. Registration/unregistration are fire-
    // and-forget from this process worker's own point of view - the actual
    // notification, when one fires, arrives later as a completely separate,
    // unsolicited "fs-change" FS Worker event routed by kernel/worker.ts's
    // own fsClient.onEvent() handler (not through this bootProcess()
    // closure at all, since that event names its target by processId, not
    // by which worker.onmessage happened to be listening).
    if (type === "fs-watch-register") {
      const { id, path, recursive } = eventPayload as { id: string; path: string; recursive?: boolean };
      void fsClient.request({ action: "watch", watchId: id, path, recursive, processId });
      return;
    }
    if (type === "fs-watch-unregister") {
      const { id } = eventPayload as { id: string };
      void fsClient.request({ action: "unwatch", watchId: id });
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
      // The top-level "listen" event (dwc.addEventListener) fires from HERE,
      // not from net-listen above, even though both arrive from the same
      // net.Server.listen() call (bindings/net.ts posts net-listen then
      // net-pipe-listen, synchronously, in that order) - traced need:
      // dwc.preview's iframe-preview flow calls netRelay.pipeConnect(),
      // which only succeeds once THIS registration (not net-listen's) has
      // landed. Firing from net-listen raced the host page's resulting
      // iframe navigation against this message actually being processed -
      // intermittently producing "nothing is listening on port N" on a
      // fresh page's very first preview. Confirmed live.
      const port = portFromTcpXKey(eventPayload.key);
      if (port !== null) onEvent("listen", { port }, processId);
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
          const relayEvent = (childType: string, childPayload: any, childProcessId: string) => {
            if (childType === "stdout" || childType === "stderr") {
              worker.postMessage({ type: "cp-event", payload: { id, kind: childType, chunk: childPayload.chunk } });
              return;
            }
            if (childType === "exit") {
              childWorkersByRequestId.delete(id);
              worker.postMessage({ type: "cp-event", payload: { id, kind: "exit", code: childPayload.code } });
              return;
            }
            // npm run-script launches a package script as its own child
            // process (typically `sh -c vite`). stdout/stderr/exit travel
            // back to npm as cp-events, but a top-level host `listen` event
            // has no Node child_process equivalent to relay through. Forward
            // it directly through this parent process's handler so a
            // dwc.shell.spawn("npm run dev") caller can start its preview.
            if (childType === "listen") {
              onEvent("listen", childPayload, childProcessId);
            }
          };

          // Real npm's own @npmcli/run-script (backing `npm exec`/`npx`,
          // and any package.json "scripts" launch) always spawns through a
          // shell - `spawn('sh', ['-c', '<line>'], {env, ...})` - after its
          // own shell:true handling turns the literal command into that
          // shape. There's no vendored `/bin/sh` this could ever resolve to
          // via the normal single-command path below; dispatch through the
          // same shell/tokenize.ts interpreter cp-exec's own runShellInternal
          // already uses instead, but streamed (see runShellLineStreamed's
          // own doc comment) rather than buffered, matching spawn()'s real
          // contract.
          if (command === "sh" && childArgs.length === 2 && childArgs[0] === "-c") {
            await runShellLineStreamed(
              fsClient,
              processTable,
              fetcherClient,
              netRelay,
              { line: childArgs[1], cwd: childCwd, env: childEnv ?? {} },
              relayEvent,
              (childWorker) => childWorkersByRequestId.set(id, childWorker),
            );
            return;
          }

          const resolved = await resolveEntryPoint(fsClient, command, childArgs, childCwd, childEnv);
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
            relayEvent,
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
      void fsClient.request({ action: "unwatchProcess", processId });
      worker.terminate();
    }

    onEvent(type, eventPayload, processId);
  };

  // Without this, a script-load failure (e.g. a broken build that ships an
  // unresolvable import inside this worker's file) leaves the caller
  // waiting on stdout/exit forever with no signal anything went wrong -
  // confirmed live via a bundling regression that did exactly this before
  // this handler existed. Mirrors the "exit" cleanup above so the caller
  // sees a normal-shaped exit rather than a distinct error path.
  worker.onerror = (event) => {
    processTable.remove(processId);
    netRelay.unregisterWorker(processId);
    void fsClient.request({ action: "unwatchProcess", processId });
    worker.terminate();
    onEvent("stderr", { chunk: new TextEncoder().encode(`Process worker failed to load or crashed: ${event.message || "unknown error"}\n`) }, processId);
    onEvent("exit", { code: 1 }, processId);
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

  // A real, if minimal, default PATH - matching apis/Process.ts's own
  // dwc.process.spawn() convention. Without at least one truthy PATH key
  // here, real npm's own @npmcli/run-script setPATH() (which only ever
  // UPDATES an existing PATH-shaped env key, never adds one from scratch -
  // see set-path.js) has nothing to extend, so every descendant it spawns
  // (e.g. `npm create`'s own internal `sh -c <fetched-package-bin>` call)
  // permanently has no PATH at all - this was the actual root cause of a
  // real `npm create vite` failing with "create-vite: command not found"
  // even after the package was correctly fetched and bin-linked.
  await bootProcess(fsClient, processTable, fetcherClient, netRelay, { entryPath, argv, env: { PATH: "/bin" }, cwd }, (type, eventPayload) => {
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
  const resolved = await resolveEntryPoint(fsClient, payload.command, payload.args, payload.cwd, payload.env);
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

/** child_process.spawn()'s own real, streaming counterpart to
 * runShellInternal below - same `&&`-chained-line, `cd`-mutates-cwd-in-
 * place, resolveEntryPoint()-per-command shape (reusing the exact same
 * shell/tokenize.ts interpreter), but relays each command's stdout/stderr
 * to `onEvent` AS PRODUCED, matching spawn()'s real streaming contract,
 * instead of buffering everything into one string and returning only at the
 * end. Traced need: real npm's own @npmcli/run-script (backing `npm exec`/
 * `npx`, and any package.json "scripts" launch) always spawns through a
 * shell - `spawn('sh', ['-c', line], {env, ...})` - so a caller-visible
 * child_process.spawn()'d process (real npm's own promise-based
 * `.on('data', ...)`/`.on('close', ...)` consumers, not just a one-shot
 * exec() result) needs this, not runShellInternal's buffered shape. `env`
 * is threaded through to resolveEntryPoint() on every command specifically
 * so its own PATH search can find whatever real npm's own setPATH()
 * resolved (a fetched package's bin-linked node_modules/.bin, never
 * `/bin/`) - the one piece runShellInternal/runProgramViaShell don't carry
 * at all today, and the actual reason `npm create <template>` couldn't find
 * its own fetched package's executable before this existed. A command with
 * a `>` redirect target still runs through the older buffered
 * runProgramViaShell (real Node's own streaming stdout wouldn't make sense
 * with output being redirected to a file instead), sharing this function's
 * own env for the same PATH-search reason. */
const runShellLineStreamed = async (
  fsClient: FsClient,
  processTable: ProcessTable,
  fetcherClient: FetcherClient,
  netRelay: NetRelay,
  payload: { line: string; cwd: string; env: Record<string, string> },
  onEvent: ProcessEventHandler,
  onWorkerCreated?: (worker: Worker) => void,
): Promise<void> => {
  const commands = parseCommands(tokenize(payload.line));
  let cwd = payload.cwd;
  let exitCode = 0;

  for (const command of commands) {
    const name = command.argv[0];
    if (!name) continue;

    if (name === "cd") {
      const target = command.argv[1] ? resolvePath(cwd, command.argv[1]) : "/";
      const stat = await fsClient.request<{ isDirectory: boolean }>({ action: "stat", path: target }).catch(() => null);
      if (!stat?.isDirectory) {
        onEvent("stderr", { chunk: new TextEncoder().encode(`cd: not a directory: ${command.argv[1] ?? target}\n`) }, "");
        exitCode = 1;
        break;
      }
      cwd = target;
      exitCode = 0;
      continue;
    }

    if (command.redirectOut) {
      const resolved = await resolveEntryPoint(fsClient, name, command.argv.slice(1), cwd, payload.env);
      if (!resolved) {
        onEvent("stderr", { chunk: new TextEncoder().encode(`${name}: command not found\n`) }, "");
        exitCode = 127;
        break;
      }
      const result = await runProgramViaShell(resolved.entryPath, resolved.args, cwd, fsClient, processTable, fetcherClient, netRelay);
      await fsClient.request({ action: "writeFile", path: resolvePath(cwd, command.redirectOut), contents: result.output });
      exitCode = result.exitCode;
      if (exitCode !== 0) break;
      continue;
    }

    const resolved = await resolveEntryPoint(fsClient, name, command.argv.slice(1), cwd, payload.env);
    if (!resolved) {
      onEvent("stderr", { chunk: new TextEncoder().encode(`${name}: command not found\n`) }, "");
      exitCode = 127;
      break;
    }

    let resolveExit!: () => void;
    const exited = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    await bootProcess(
      fsClient,
      processTable,
      fetcherClient,
      netRelay,
      { entryPath: resolved.entryPath, argv: resolved.args, env: payload.env, cwd },
      (childType, childPayload, childProcessId) => {
        if (childType === "exit") {
          exitCode = childPayload.code;
          resolveExit();
          return;
        }
        onEvent(childType, childPayload, childProcessId);
      },
      onWorkerCreated,
    );
    await exited;
    if (exitCode !== 0) break;
  }

  onEvent("exit", { code: exitCode }, "");
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
  // A shell spawn's line may run through several DIFFERENT process workers
  // over its lifetime (one per `&&`-separated command), so unlike processTable
  // there's no single stable Worker to key on - this tracks whichever one is
  // CURRENTLY running under a given shellId, updated live via
  // runShellLineStreamed's onWorkerCreated hook, purely so killShell() has
  // something to terminate.
  const shellWorkers = new Map<string, Worker | null>();

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

  const spawnShell = async (payload: ShellSpawnPayload): Promise<{ shellId: string }> => {
    // Same real, if minimal, default PATH runProgramViaShell() itself seeds -
    // without it, real npm's own setPATH() (which only ever EXTENDS an
    // existing PATH-shaped env key, never creates one from scratch) has
    // nothing to extend for anything this line spawns.
    const { line, cwd = "/", env = { PATH: "/bin" } } = payload;
    const shellId = crypto.randomUUID();
    shellWorkers.set(shellId, null);

    void runShellLineStreamed(
      fsClient,
      processTable,
      fetcherClient,
      netRelay,
      { line, cwd, env },
      (type, eventPayload) => {
        if (type === "stdout" || type === "stderr") {
          postEvent(`shell:${type}`, { shellId, chunk: eventPayload.chunk });
          return;
        }
        if (type === "exit") {
          postEvent("shell:exit", { shellId, code: eventPayload.code });
          return;
        }
        if (type === "listen") {
          // Matches spawn()'s own "listen" forwarding above - a host page
          // cares that something is listening, not which call started it
          // (traced need: `npm run dev` running a real dev server through
          // dwc.shell.spawn() should still fire the same "listen" event
          // dwc.process.spawn() already does).
          postEvent("listen", { port: eventPayload.port });
        }
      },
      (worker) => {
        shellWorkers.set(shellId, worker);
      },
    )
      // runShellLineStreamed already turns any resolution/exit-code failure
      // into its own "exit" event - this only guards against a genuinely
      // unexpected throw (e.g. an fsClient request rejecting) so a shellId
      // never leaks forever with nothing ever posting its exit.
      .catch(() => postEvent("shell:exit", { shellId, code: 1 }))
      .finally(() => shellWorkers.delete(shellId));

    return { shellId };
  };

  const killShell = (payload: ShellKillPayload): void => {
    const worker = shellWorkers.get(payload.shellId);
    if (worker === undefined) return; // unknown or already-finished shellId
    shellWorkers.delete(payload.shellId);
    worker?.terminate();
    postEvent("shell:exit", { shellId: payload.shellId, code: 143 });
  };

  const stdin = (payload: StdinPayload): void => {
    processTable.getWorker(payload.processId)?.postMessage({ type: "stdin", payload: { chunk: payload.chunk } });
  };

  const kill = (payload: KillPayload): void => {
    const worker = processTable.getWorker(payload.processId);
    if (!worker) return;
    processTable.remove(payload.processId);
    netRelay.unregisterWorker(payload.processId);
    void fsClient.request({ action: "unwatchProcess", processId: payload.processId });
    worker.terminate();
    postEvent("process:exit", { processId: payload.processId, code: 143 });
  };

  return { spawn, runShell, stdin, kill, spawnShell, killShell };
};

export { createProcessClient };
export type { KillPayload, ProcessClient, ShellExecPayload, ShellKillPayload, ShellSpawnPayload, SpawnPayload, StdinPayload };
