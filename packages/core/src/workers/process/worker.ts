import { createBuiltinModules } from "../../runtime/builtins";
import { createFsBuiltin } from "../../runtime/builtins/fs";
import type { FsBuiltin, FsBuiltinIO } from "../../runtime/builtins/fs";
import { createEventLoop } from "../../runtime/eventLoop";
import { createModuleLoader } from "../../runtime/moduleLoader";
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

const createFsBuiltinFromPayload = (syncFs: SyncFsChannelPayload | null): FsBuiltin => {
  const io: FsBuiltinIO = {};

  if (syncFs) {
    const channel: SyncFsChannel = { port: syncFs.port, control: new Int32Array(syncFs.control), data: syncFs.data };
    io.callSync = (request) => callSyncFs(channel, request);
  }

  return createFsBuiltin(io);
};

const boot = (payload: BootPayload): void => {
  const eventLoop = createEventLoop();

  const processGlobal = {
    argv: ["node", payload.entryPath, ...payload.argv],
    env: payload.env,
    cwd: () => payload.cwd,
    exitCode: 0,
    exit(code = 0) {
      exitCode = code;
      exitProcess(exitCode);
    },
    nextTick: eventLoop.nextTick,
    stdout: createWritableStream("stdout"),
    stderr: createWritableStream("stderr"),
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
  const moduleLoader = createModuleLoader({
    sources: payload.sources,
    builtins: { ...vendoredBuiltins, fs: createFsBuiltinFromPayload(payload.syncFs) },
    process: processGlobal,
  });

  try {
    moduleLoader.run(payload.entryPath);
  } catch (error) {
    write("stderr", `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    exitProcess(1);
    return;
  }

  drain(eventLoop)
    .then(() => exitProcess(exitCode))
    .catch((error: unknown) => {
      // A callback the loop drained (a timer, a nextTick — e.g. the async
      // dns.lookup()->connect() chain) can throw same as top-level code can;
      // uncaught, it would otherwise just reject this promise silently, with
      // nothing to report it and the process never exiting.
      write("stderr", `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
      exitProcess(1);
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
