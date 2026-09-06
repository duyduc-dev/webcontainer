import { createBuiltinModules } from "../../runtime/builtins";
import { createFsBuiltin } from "../../runtime/builtins/fs";
import type { FsBuiltin, FsBuiltinIO } from "../../runtime/builtins/fs";
import { createEventLoop } from "../../runtime/eventLoop";
import { createModuleLoader } from "../../runtime/moduleLoader";
import { FsOp } from "../../kernel/fs/syncWireFormat";
import { callSyncFs } from "./syncFsClient";
import type { SyncFsChannel } from "./syncFsClient";
import { postEvent } from "./service";

interface SyncFsChannelPayload {
  port: MessagePort;
  control: SharedArrayBuffer;
  data: SharedArrayBuffer;
}

interface BootPayload {
  entryPath: string;
  sources: Record<string, string>;
  argv: string[];
  env: Record<string, string>;
  cwd: string;
  syncFs: SyncFsChannelPayload | null;
}

interface NetReply {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  bodyBytes: ArrayBuffer;
}

interface NetRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
}

interface PipeRelayMessage {
  type: "pipe-open" | "pipe-data" | "pipe-shutdown" | "pipe-close";
  connId: number;
  path?: string;
  chunk?: Uint8Array;
}

interface ChildProcessSpawnHandlers {
  onStdout(chunk: Uint8Array): void;
  onStderr(chunk: Uint8Array): void;
  onExit(code: number | null, errorMessage?: string): void;
}

const encoder = new TextEncoder();

let exitCode = 0;
let exited = false;
const pendingNetRequests = new Map<string, { resolve: (reply: NetReply) => void; reject: (error: unknown) => void }>();
const pendingPipeConnects = new Map<string, { resolve: (v: { connId: number }) => void; reject: (error: unknown) => void }>();
let pipeMessageHandler: ((msg: PipeRelayMessage) => void) | null = null;
const childSpawnHandlers = new Map<string, ChildProcessSpawnHandlers>();
const pendingChildExecs = new Map<
  string,
  { resolve: (v: { output: string; cwd: string; exitCode: number }) => void; reject: (error: unknown) => void }
>();

/** Bridges the guest realm's globalThis.__dwcFetchAsync (see internal/fetch-transport.js)
 * up through the kernel to the Fetcher Worker — the only place with real network access.
 * Refs the event loop for the duration, since a reply arrives via a real message from
 * another worker, not anything the loop already tracks (a timer/immediate/nextTick). */
const createNetRequest = (eventLoop: ReturnType<typeof createEventLoop>) => {
  return (url: string, init: NetRequestInit = {}): Promise<NetReply> => {
    const id = crypto.randomUUID();
    eventLoop.ref();
    return new Promise<NetReply>((resolve, reject) => {
      pendingNetRequests.set(id, {
        resolve: (reply) => {
          eventLoop.unref();
          resolve(reply);
        },
        reject: (error) => {
          eventLoop.unref();
          reject(error);
        },
      });
      // Copy (never transfer) the body: a Node Buffer may be a view over a
      // shared/pooled ArrayBuffer, and transferring it would detach that pool
      // out from under any other Buffer still referencing it.
      const body = init.body ? init.body.slice().buffer : undefined;
      self.postMessage({
        type: "net-request",
        payload: { id, url, method: init.method, headers: init.headers, body },
      });
    });
  };
};

const handleNetResponse = (payload: { id: string; ok: boolean; result?: NetReply; error?: { code: string; message: string } }): void => {
  const waiting = pendingNetRequests.get(payload.id);
  if (!waiting) return;
  pendingNetRequests.delete(payload.id);

  if (payload.ok) waiting.resolve(payload.result!);
  else waiting.reject(Object.assign(new Error(payload.error!.message), { code: payload.error!.code }));
};

/** The process-worker half of 'net's cross-process relay (see
 * workers/kernel/netRelay.ts) — a plain postMessage bridge up to the kernel,
 * mirroring createNetRequest's shape. listen()/pipeListen() are fire-and-
 * forget; pipeConnect() refs the loop for the round trip, same reasoning as
 * createNetRequest (the reply arrives via a message from another worker, not
 * anything the loop already tracks). */
const createNetBridge = (eventLoop: ReturnType<typeof createEventLoop>) => ({
  listen: (port: number): void => self.postMessage({ type: "net-listen", payload: { port } }),
  closeServer: (port: number): void => self.postMessage({ type: "net-close-server", payload: { port } }),
  pipeListen: (key: string): void => self.postMessage({ type: "net-pipe-listen", payload: { key } }),
  pipeCloseServer: (key: string): void => self.postMessage({ type: "net-pipe-close-server", payload: { key } }),
  pipeConnect: (key: string): Promise<{ connId: number }> => {
    const id = crypto.randomUUID();
    eventLoop.ref();
    return new Promise((resolve, reject) => {
      pendingPipeConnects.set(id, {
        resolve: (v) => {
          eventLoop.unref();
          resolve(v);
        },
        reject: (error) => {
          eventLoop.unref();
          reject(error);
        },
      });
      self.postMessage({ type: "net-pipe-connect", payload: { id, key } });
    });
  },
  postRaw: (msg: PipeRelayMessage): void => self.postMessage({ type: "net-pipe-relay", payload: msg }),
  onMessage: (handler: (msg: PipeRelayMessage) => void): void => {
    pipeMessageHandler = handler;
  },
});

const handlePipeConnectResponse = (payload: { id: string; connId: number }): void => {
  const waiting = pendingPipeConnects.get(payload.id);
  if (!waiting) return;
  pendingPipeConnects.delete(payload.id);
  waiting.resolve({ connId: payload.connId });
};

/** The process-worker half of child_process's guest-to-kernel relay (see
 * workers/kernel/processClient.ts's "cp-spawn"/"cp-exec" handling inside
 * bootProcess()). spawn() is an ongoing relay (stdout/stderr/exit events
 * tagged by request id, like net's pipe relay), refed for the child's whole
 * lifetime; exec() is one-shot request/response, same shape as
 * createNetRequest. */
const createChildProcessBridge = (eventLoop: ReturnType<typeof createEventLoop>) => ({
  spawn: (command: string, args: string[], cwd: string, env: Record<string, string>, handlers: ChildProcessSpawnHandlers): { kill(): void } => {
    const id = crypto.randomUUID();
    eventLoop.ref();
    childSpawnHandlers.set(id, {
      onStdout: handlers.onStdout,
      onStderr: handlers.onStderr,
      onExit: (code, errorMessage) => {
        eventLoop.unref();
        handlers.onExit(code, errorMessage);
      },
    });
    self.postMessage({ type: "cp-spawn", payload: { id, command, args, cwd, env } });
    return {
      kill: () => self.postMessage({ type: "cp-kill", payload: { id } }),
    };
  },
  exec: (line: string, cwd: string): Promise<{ output: string; cwd: string; exitCode: number }> => {
    const id = crypto.randomUUID();
    eventLoop.ref();
    return new Promise((resolve, reject) => {
      pendingChildExecs.set(id, {
        resolve: (v) => {
          eventLoop.unref();
          resolve(v);
        },
        reject: (error) => {
          eventLoop.unref();
          reject(error);
        },
      });
      self.postMessage({ type: "cp-exec", payload: { id, line, cwd } });
    });
  },
});

const handleChildProcessEvent = (payload: {
  id: string;
  kind: "stdout" | "stderr" | "exit" | "error";
  chunk?: Uint8Array;
  code?: number;
  message?: string;
}): void => {
  const handlers = childSpawnHandlers.get(payload.id);
  if (!handlers) return;

  if (payload.kind === "stdout") {
    handlers.onStdout(payload.chunk!);
    return;
  }
  if (payload.kind === "stderr") {
    handlers.onStderr(payload.chunk!);
    return;
  }
  childSpawnHandlers.delete(payload.id);
  handlers.onExit(payload.kind === "error" ? null : payload.code!, payload.kind === "error" ? payload.message : undefined);
};

const handleChildExecResponse = (payload: {
  id: string;
  ok: boolean;
  result?: { output: string; cwd: string; exitCode: number };
  error?: { message: string };
}): void => {
  const waiting = pendingChildExecs.get(payload.id);
  if (!waiting) return;
  pendingChildExecs.delete(payload.id);

  if (payload.ok) waiting.resolve(payload.result!);
  else waiting.reject(new Error(payload.error!.message));
};

const exitProcess = (code: number): void => {
  if (exited) return;
  exited = true;
  postEvent("exit", { code });
};

const write = (stream: "stdout" | "stderr", chunk: string | Uint8Array): void => {
  postEvent(stream, { chunk: typeof chunk === "string" ? encoder.encode(chunk) : chunk });
};

/** Minimal process.stdout/stderr — just enough for coreutils-style programs'
 * `process.stdout.write(...)` idiom (real Node's own convention, which every
 * demo/script so far has avoided in favor of console.log). Reference-equality
 * checks against these in vendored lib code (net.js, streams/readable.js)
 * stay correct either way; nothing there calls .write() on them. */
const createWritableStream = (stream: "stdout" | "stderr") => ({
  write: (chunk: string | Uint8Array): boolean => {
    write(stream, chunk);
    return true;
  },
  isTTY: false,
});

const createSyncFsChannel = (syncFs: SyncFsChannelPayload | null): SyncFsChannel | null =>
  syncFs ? { port: syncFs.port, control: new Int32Array(syncFs.control), data: syncFs.data } : null;

const createFsBuiltinFromChannel = (channel: SyncFsChannel | null): FsBuiltin => {
  const io: FsBuiltinIO = {};
  if (channel) io.callSync = (request) => callSyncFs(channel, request);
  return createFsBuiltin(io);
};

const decoder = new TextDecoder();

/** Backs moduleLoader.ts's `readFileSync` fallback with the same synchronous
 * SharedArrayBuffer bridge guest `fs.*Sync` calls use - see that option's doc
 * comment for why the ahead-of-boot preload can miss a real, on-VFS file.
 * Any failure (ENOENT, EISDIR against a directory candidate, ...) is "not
 * this candidate," not a fatal error - the caller tries the next one. */
const createModuleReadFileSync = (channel: SyncFsChannel | null): ((path: string) => string | null) | undefined => {
  if (!channel) return undefined;
  return (path) => {
    try {
      const response = callSyncFs(channel, { op: FsOp.READ_FILE, path });
      return response.op === FsOp.READ_FILE ? decoder.decode(response.contents) : null;
    } catch {
      return null;
    }
  };
};

const boot = (payload: BootPayload): void => {
  const eventLoop = createEventLoop();

  const processGlobal: { nextTick: typeof eventLoop.nextTick; env: Record<string, string>; [key: string]: unknown } = {
    argv: ["node", payload.entryPath, ...payload.argv],
    env: payload.env,
    cwd: () => payload.cwd,
    exitCode: 0,
    exit(code = 0) {
      exitCode = code as number;
      exitProcess(exitCode);
    },
    nextTick: eventLoop.nextTick,
    stdout: createWritableStream("stdout"),
    stderr: createWritableStream("stderr"),
    title: "node",
    // Matches the pinned version the vendored lib/*.js sources actually come
    // from (see e.g. lib/net.js's own "VENDORED VERBATIM from Node.js
    // v24.18.0" header) - the most honest answer for anything (like npm's own
    // engines check) that compares process.version against what's running.
    version: "v24.18.0",
    versions: { node: "24.18.0" },
    platform: "linux",
    arch: "x64",
  };

  // 'net' needs the loop's close phase + liveness ref/unref (see eventLoop.ts's
  // queueClose doc comment and bindings/net.ts's recount()), so the vendored
  // builtins are built ONCE here — not left to moduleLoader's own default
  // construction — and threaded through as options.builtins below. That also
  // means the SAME Buffer class installed as a global (net's `buf()` helper
  // reads it from there) is the one guest code's `require('buffer')` gets too;
  // building two separate instances would make `instanceof Buffer` disagree
  // between them.
  const netContext = {
    queueClose: eventLoop.queueClose,
    ref: eventLoop.ref,
    unref: eventLoop.unref,
    netBridge: createNetBridge(eventLoop),
    childProcessBridge: createChildProcessBridge(eventLoop),
  };
  const vendoredBuiltins = createBuiltinModules(processGlobal, netContext);

  // Real Node's process is an EventEmitter (uncaughtException/unhandledRejection
  // listeners, npm's own proc-log wiring via process.emit('log'/'output', ...)) -
  // ours was a plain object until now, which every one of those calls would throw
  // on. Mixed in AFTER building vendoredBuiltins (which only ever needed the
  // narrow {nextTick, env} shape above) so the real vendored EventEmitter class
  // is available; applied to the SAME object every other reference below already
  // points at, not a new one, since Object.assign(self, {process: processGlobal})
  // hasn't run yet.
  const EventEmitter = vendoredBuiltins.events as new () => { emit(event: string, ...args: unknown[]): boolean };
  Object.setPrototypeOf(processGlobal, EventEmitter.prototype);
  EventEmitter.call(processGlobal as unknown as InstanceType<typeof EventEmitter>);

  // The module wrapper (new Function) closes over the global scope, so console/process/
  // timers must be real globals here rather than parameters threaded through requires.
  Object.assign(self, {
    console: {
      log: (...args: unknown[]) => write("stdout", `${args.map(String).join(" ")}\n`),
      info: (...args: unknown[]) => write("stdout", `${args.map(String).join(" ")}\n`),
      warn: (...args: unknown[]) => write("stderr", `${args.map(String).join(" ")}\n`),
      error: (...args: unknown[]) => write("stderr", `${args.map(String).join(" ")}\n`),
    },
    process: processGlobal,
    setTimeout: eventLoop.setTimeout,
    clearTimeout: eventLoop.clearTimeout,
    setImmediate: eventLoop.setImmediate,
    clearImmediate: eventLoop.clearImmediate,
    __dwcFetchAsync: createNetRequest(eventLoop),
    Buffer: (vendoredBuiltins.buffer as { Buffer: unknown }).Buffer,
  });

  // netContext is NOT threaded through here: `builtins` below already carries
  // net/dns/tls from the ONE `vendoredBuiltins` built above, and moduleLoader's
  // own default construction (createBuiltinModules(options.process,
  // options.netContext)) would otherwise build a SECOND, independent net
  // binding closure purely to have its output thrown away by the `builtins`
  // override spread — except that closure's `netBridge.onMessage()` call has
  // a live side effect: it steals the kernel's cross-process relay dispatch
  // away from the (correct) instance guest code actually calls require('net')
  // on, so every accepted cross-process connection dispatches into a
  // `pipeServers` map nothing ever populated and gets closed immediately.
  const syncFsChannel = createSyncFsChannel(payload.syncFs);
  const moduleLoader = createModuleLoader({
    sources: payload.sources,
    builtins: { ...vendoredBuiltins, fs: createFsBuiltinFromChannel(syncFsChannel) },
    process: processGlobal,
    readFileSync: createModuleReadFileSync(syncFsChannel),
  });

  // Real Node emits 'uncaughtException' on `process` before its own default
  // reporting - real npm relies on this (its ExitHandler installs a listener
  // that prints its own message and calls process.exit() itself). Emitted
  // unconditionally (a no-op if nothing's listening); the write+exitProcess(1)
  // fallback below still runs either way, but is itself a no-op once a
  // listener has already called exit() (exitProcess() guards on `exited`), so
  // a listener's own exit code always wins over this default.
  //
  // `handlingFatalException` mirrors real Node's own re-entrancy guard around
  // its fatal-exception path: a guest 'uncaughtException' listener that itself
  // throws (real npm's own lib/cli/validate-engines.js does exactly this -
  // its handler re-throws anything that isn't a SyntaxError) must NOT cause a
  // second emit() - emit() isn't wrapped in its own try/catch, so that second
  // throw would escape emit(), escape this function, and (since it's now
  // "uncaught" all over again) come straight back here via the self
  // 'error' listener below, re-entering reportUncaught and re-emitting
  // forever. Once we're already handling one fatal exception, any further
  // error just goes straight to the write+exit fallback with no user
  // listener involved - same as real Node.
  let handlingFatalException = false;
  const reportUncaught = (error: unknown): void => {
    let errorObj = error instanceof Error ? error : new Error(String(error));
    if (!handlingFatalException) {
      handlingFatalException = true;
      try {
        (processGlobal as unknown as { emit(event: string, ...args: unknown[]): boolean }).emit(
          "uncaughtException",
          errorObj,
        );
      } catch (nestedError) {
        errorObj = nestedError instanceof Error ? nestedError : new Error(String(nestedError));
      }
    }
    write("stderr", `${errorObj.stack ?? errorObj.message}\n`);
    exitProcess(1);
  };

  // Guest code can reach a native, untracked async primitive our own eventLoop
  // never sees - a bare `Promise` chain with no `.catch`, or a listener that
  // itself throws while reportUncaught() is already unwinding (see above) -
  // and end up as a genuine top-level worker error that bubbles past this
  // worker entirely (surfacing at the kernel bridge's `onerror`, per the
  // WHATWG nested-worker error-propagation algorithm) - drain()'s catch below
  // only sees errors from work items the eventLoop itself scheduled and
  // awaited. Catching both here and preventDefault()-ing keeps every uncaught
  // error on the same uncaughtException/stderr/exit(1) path regardless of
  // which primitive guest code used to schedule it, and the reentrancy guard
  // above keeps that from looping when the error came from inside
  // reportUncaught's own emit() call.
  self.addEventListener("error", (event) => {
    event.preventDefault();
    reportUncaught(event.error ?? event.message);
  });
  self.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    reportUncaught((event as PromiseRejectionEvent).reason);
  });

  try {
    moduleLoader.run(payload.entryPath);
  } catch (error) {
    reportUncaught(error);
    return;
  }

  drain(eventLoop)
    .then(() => exitProcess(exitCode))
    .catch((error: unknown) => {
      // A callback the loop drained (a timer, a nextTick — e.g. the async
      // dns.lookup()->connect() chain) can throw same as top-level code can;
      // uncaught, it would otherwise just reject this promise silently, with
      // nothing to report it and the process never exiting.
      reportUncaught(error);
    });
};

const drain = async (eventLoop: ReturnType<typeof createEventLoop>): Promise<void> => {
  while (eventLoop.hasPendingWork()) {
    const didWork = await eventLoop.runOnce();
    if (!didWork) break;
  }
};

self.onmessage = (event: MessageEvent<{ type: string; payload?: unknown }>) => {
  if (event.data.type === "boot") boot(event.data.payload as BootPayload);
  else if (event.data.type === "net-response") handleNetResponse(event.data.payload as Parameters<typeof handleNetResponse>[0]);
  else if (event.data.type === "net-pipe-connect-response") handlePipeConnectResponse(event.data.payload as { id: string; connId: number });
  else if (event.data.type === "net-pipe-message") pipeMessageHandler?.(event.data.payload as PipeRelayMessage);
  else if (event.data.type === "cp-event") handleChildProcessEvent(event.data.payload as Parameters<typeof handleChildProcessEvent>[0]);
  else if (event.data.type === "cp-exec-response") handleChildExecResponse(event.data.payload as Parameters<typeof handleChildExecResponse>[0]);
};
