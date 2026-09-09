// The nested-Worker bootstrap for worker_threads.Worker (runtime/builtins/
// worker_threads.ts's `spawnWorker`) - a REAL, separate browser Worker
// spawned directly from a guest process's own Worker context. Traced scope:
// exactly what @napi-rs/wasm-runtime's own wasi-worker.mjs needs (the only
// real caller of worker_threads.Worker this project has traced - see
// PROGRESS.md's node:wasi/worker_threads.Worker notes) - require()/fs/
// process/console/timers/Buffer plus `worker_threads.parentPort` - NOT a
// full nested Node sandbox. net/http/child_process/readline/vm/etc. are
// deliberately not wired here; add them if/when a real traced need shows up,
// the same way every other gap in this project got filled.
import { createBuiltinModules } from "../../runtime/builtins";
import { createFsBuiltin, createFsPromisesBuiltin } from "../../runtime/builtins/fs";
import type { FsBuiltin, FsBuiltinIO } from "../../runtime/builtins/fs";
import { createEventLoop } from "../../runtime/eventLoop";
import { createModuleLoader } from "../../runtime/moduleLoader";
import { callSyncFs } from "../process/syncFsClient";
import type { SyncFsChannel } from "../process/syncFsClient";

// Captured before any guest code can run - real Node-emulating vendored
// code routinely does `Object.assign(globalThis, { postMessage: (msg) =>
// parentPort.postMessage(msg), ... })` at its own top level (confirmed
// live: real @napi-rs/wasm-runtime's own wasi-worker.mjs does exactly
// this, a legitimate, expected thing for code written against real Node's
// worker_threads shape, where a bare top-level `postMessage` is commonly
// wired to parentPort as a convenience). If this file's own
// parentPort.postMessage() below called the bare `self.postMessage`
// instead of a reference captured here, the FIRST call after that guest
// override lands would recurse forever: self.postMessage -> the guest's
// wrapper -> parentPort.postMessage -> self.postMessage (now the guest's
// own wrapper again) -> ... - a real, silent, unrecoverable hang with no
// error, no stack overflow message a caller ever sees (confirmed live:
// this exact mechanism was this session's actual root cause for the
// long-investigated "npm run dev never reaches Local:" hang - see
// PROGRESS.md item 8). Same "grab the real one before any override can
// exist" precaution as eventLoop.ts's own nativeSetTimeout/
// nativeMessageChannel and workers/process/worker.ts's own
// nativeMessageChannel.
const nativePostMessage = self.postMessage.bind(self) as (message: unknown, transferList?: Transferable[]) => void;

interface SyncFsChannelPayload {
  port: MessagePort;
  control: SharedArrayBuffer;
  data: SharedArrayBuffer;
}

interface WorkerThreadsBootPayload {
  entryPath: string;
  cwd: string;
  env: Record<string, string>;
  workerData: unknown;
  syncFs: SyncFsChannelPayload | null;
}

const createSyncFsChannel = (payload: SyncFsChannelPayload | null): SyncFsChannel | null =>
  payload ? { port: payload.port, control: new Int32Array(payload.control), data: payload.data } : null;

type ParentPortListener = (data: unknown) => void;

const boot = async (payload: WorkerThreadsBootPayload): Promise<void> => {
  const eventLoop = createEventLoop();

  // Real Node's parentPort is a MessagePort with EventEmitter-style .on()/
  // .off() (data delivered bare, not wrapped in a MessageEvent) - traced
  // need: wasi-worker.mjs does exactly `parentPort.on("message", (data) =>
  // ...)` and `parentPort.postMessage(msg)`, nothing else.
  //
  // A real MessagePort queues messages that arrive before it's "started"
  // (implicitly, on its first attached listener) rather than dropping them -
  // real code (wasi-worker.mjs included) routinely posts a message to a
  // freshly-created Worker immediately, with no synchronization, relying on
  // exactly this guarantee. This runtime's own boot sequence makes that gap
  // real and not just theoretical: `self.addEventListener("message", ...)`
  // below is live from the moment this function starts, but the guest
  // script's own `parentPort.on("message", ...)` call only happens once
  // moduleLoader.run() actually reaches it - a real, measurable delay (the
  // sync fs bridge's own Atomics.wait round trips to resolve/read the entry
  // module). A message sent in that window - confirmed live, this exact gap
  // silently dropped a real postMessage() in this feature's first end-to-end
  // trace - would otherwise vanish with no listener ever having existed to
  // receive it. Buffered here and flushed, in order, to the first listener
  // that attaches; not needed for a listener attached before anything
  // arrives (the common case), where this is just an empty array.
  const pendingMessages: unknown[] = [];
  const messageListeners = new Set<ParentPortListener>();
  self.addEventListener("message", (event: MessageEvent) => {
    if (messageListeners.size === 0) {
      pendingMessages.push(event.data);
      return;
    }
    for (const listener of messageListeners) dispatchToListener(listener, event.data);
  });
  // Real MessagePort/EventTarget semantics: a listener throwing is reported
  // as an uncaught error on its own turn, never propagated synchronously
  // back into whoever posted the message or registered the listener -
  // dispatchEvent() itself never throws because one handler misbehaved.
  // Matters here because this call site's own caller (below) may be guest
  // top-level module code that has no reason to expect .on("message", ...)
  // itself to throw.
  const dispatchToListener = (listener: ParentPortListener, data: unknown): void => {
    try {
      listener(data);
    } catch (error) {
      queueMicrotask(() => {
        throw error;
      });
    }
  };
  const startListening = (listener: ParentPortListener): void => {
    const alreadyStarted = messageListeners.size > 0;
    messageListeners.add(listener);
    if (!alreadyStarted && pendingMessages.length > 0) {
      const queued = pendingMessages.splice(0, pendingMessages.length);
      // Real Node's own MessagePort delivery is always genuinely
      // asynchronous - even a message that arrived before this listener
      // existed is only ever handed to it on a LATER turn, never inside the
      // same synchronous call stack as the .on("message", ...) call itself.
      // A caller's own top-level module body routinely finishes additional
      // setup (assigning globalThis.onmessage, etc.) AFTER calling .on() -
      // confirmed live, this exact ordering (real
      // @napi-rs/wasm-runtime's own wasi-worker.mjs: `parentPort.on(
      // "message", data => globalThis.onmessage({data}))` on one line,
      // `globalThis.onmessage = ...` several lines later, in the same
      // top-level body) - flushing synchronously here called
      // globalThis.onmessage while it was still null, throwing and
      // silently aborting the rest of module evaluation. Deferred via a
      // microtask so the flush always happens after the current
      // synchronous stack (including the rest of the registering module's
      // own top-level code) has finished, matching real delivery order.
      queueMicrotask(() => {
        for (const data of queued) for (const l of messageListeners) dispatchToListener(l, data);
      });
    }
  };
  const parentPort = {
    postMessage: (value: unknown, transferList?: Transferable[]) => nativePostMessage(value, transferList ?? []),
    on: (event: string, listener: ParentPortListener) => {
      if (event === "message") startListening(listener);
    },
    once: (event: string, listener: ParentPortListener) => {
      if (event !== "message") return;
      const wrapped: ParentPortListener = (data) => {
        messageListeners.delete(wrapped);
        listener(data);
      };
      startListening(wrapped);
    },
    off: (event: string, listener: ParentPortListener) => {
      if (event === "message") messageListeners.delete(listener);
    },
  };

  const processGlobal: { nextTick: typeof eventLoop.nextTick; env: Record<string, string>; [key: string]: unknown } = {
    argv: ["node", payload.entryPath],
    // See workers/process/worker.ts's own doc comment on this same field.
    execArgv: [],
    env: payload.env,
    cwd: () => payload.cwd,
    nextTick: eventLoop.nextTick,
    // No real caller this project has traced writes to stdout/stderr from
    // inside a worker_threads.Worker - these just need to exist and not
    // crash (real Node's own worker threads share the main thread's real
    // stdout by default; there's no equivalent "share" to do here), so a
    // plain console passthrough is an honest, cheap stand-in rather than a
    // wired-up relay nothing needs yet.
    stdout: {
      write: (chunk: string | Uint8Array): boolean => {
        console.log(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
      },
      isTTY: false,
    },
    stderr: {
      write: (chunk: string | Uint8Array): boolean => {
        console.error(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
      },
      isTTY: false,
    },
    version: "v24.18.0",
    versions: { node: "24.18.0", webcontainer: "0.0.1" },
    platform: "linux",
    arch: "x64",
    execPath: "/usr/bin/node",
  };

  let moduleLoaderCreateRequire: ((fromPath: string) => ((specifier: string) => unknown) & { resolve(specifier: string): string }) | undefined;
  let fsBuiltinForWasi: FsBuiltin | undefined;
  const vendoredBuiltins = createBuiltinModules(
    processGlobal,
    undefined,
    (fromPath) => {
      if (!moduleLoaderCreateRequire) {
        throw new Error("module.createRequire()'s returned require() was called before this worker's module loader finished booting");
      }
      return moduleLoaderCreateRequire(fromPath);
    },
    () => {
      if (!fsBuiltinForWasi) {
        throw new Error("require('wasi')'s WASI class was constructed before this worker's fs builtin finished booting");
      }
      return fsBuiltinForWasi;
    },
    // isMainThread: false and no spawnWorker - nothing has traced a need for
    // a worker_threads.Worker to itself spawn a further-nested one (see
    // worker_threads.ts's own ThreadContext doc comment).
    { isMainThread: false, parentPort, workerData: payload.workerData },
  );

  // Real Worker global scope spec: `self` is a getter-only accessor on
  // WorkerGlobalScope.prototype (configurable, but with no setter) -
  // assigning it directly throws in strict mode. Real Node's worker_threads
  // has no such restriction (there `self` is an ordinary global, if it
  // exists at all), so real guest code written against real Node's own
  // worker_threads semantics can - and does - assign it directly. Traced
  // need: real @napi-rs/wasm-runtime's own wasi-worker.mjs (the ONLY real
  // caller of worker_threads.Worker this project has traced) does exactly
  // `Object.assign(globalThis, { self: globalThis, ... })` at its own top
  // level - confirmed live running a real `vite build`, which crashed
  // every single WASI thread-spawn with "Cannot set property self of
  // #<WorkerGlobalScope> which has only a getter" the moment that line
  // ran. Redefined as a plain writable data property before any guest code
  // runs so that real assignment succeeds normally.
  Object.defineProperty(self, "self", { value: self, writable: true, configurable: true, enumerable: true });

  Object.assign(self, {
    global: self,
    console,
    process: processGlobal,
    setTimeout: eventLoop.setTimeout,
    clearTimeout: eventLoop.clearTimeout,
    setImmediate: eventLoop.setImmediate,
    clearImmediate: eventLoop.clearImmediate,
    Buffer: (vendoredBuiltins.buffer as { Buffer: unknown }).Buffer,
  });

  const syncFsChannel = createSyncFsChannel(payload.syncFs);
  const BufferCtor = (vendoredBuiltins.buffer as { Buffer: { from(bytes: Uint8Array): Uint8Array } }).Buffer;
  const io: FsBuiltinIO = {};
  if (syncFsChannel) io.callSync = (request) => callSyncFs(syncFsChannel, request);
  const fsBuiltin = createFsBuiltin(io, eventLoop.nextTick, (bytes) => BufferCtor.from(bytes));
  fsBuiltinForWasi = fsBuiltin;
  const fsPromisesBuiltin = createFsPromisesBuiltin(fsBuiltin, eventLoop.nextTick);

  const decoder = new TextDecoder();
  const readFileSyncFallback = syncFsChannel
    ? (path: string): string | null => {
        try {
          return decoder.decode(fsBuiltin.readFileSync(path));
        } catch {
          return null;
        }
      }
    : undefined;

  const moduleLoader = createModuleLoader({
    sources: {},
    builtins: {
      ...vendoredBuiltins,
      fs: Object.assign(fsBuiltin, { promises: fsPromisesBuiltin }),
      "fs/promises": fsPromisesBuiltin,
    },
    process: processGlobal,
    readFileSync: readFileSyncFallback,
  });
  moduleLoaderCreateRequire = moduleLoader.createRequire;

  await moduleLoader.run(payload.entryPath);

  // Unlike a spawned child_process, a worker_threads.Worker isn't expected
  // to "exit" on its own - wasi-worker.mjs's whole point is staying alive
  // indefinitely as a message handler (@napi-rs/wasm-runtime's own async
  // work pool member) - so this keeps servicing real pending work
  // (timers/nextTick/promise continuations) forever, not a bounded drain.
  while (true) {
    if (eventLoop.hasPendingWork()) await eventLoop.runOnce();
    else await eventLoop.yieldToMicrotasks();
  }
};

// A boot() failure (e.g. the entry module throwing, or a real fs error) is
// otherwise an invisible unhandled rejection inside this Worker's own realm -
// browsers only dispatch a Worker's error event for a synchronous throw
// during script evaluation, not an async rejection. Reported back over the
// same channel real messages travel, tagged with a marker key deliberately
// unusual enough that real guest traffic won't collide with it by accident;
// worker_threads.ts's own DwcWorker checks for exactly this tag to turn it
// into a real 'error' event instead of a 'message' one. Duplicated as a
// literal there rather than imported (same reasoning as processClient.ts's
// own TCP_XKEY_PREFIX copy: a stable wire-contract string, not something
// worth a cross-bundle import for) - importing this file from worker_threads.ts
// would also run ITS OWN top-level `self.onmessage = ...` below, which is
// wrong when worker_threads.ts is evaluated inside the PARENT process
// worker's own realm (workers/process/worker.ts), not this nested one.
const BOOT_ERROR_TAG = "__dwc_worker_threads_boot_error__";

self.onmessage = (event: MessageEvent<{ type: string; payload?: unknown }>) => {
  if (event.data.type !== "boot") return;
  boot(event.data.payload as WorkerThreadsBootPayload).catch((error: unknown) => {
    nativePostMessage({ [BOOT_ERROR_TAG]: true, message: error instanceof Error ? error.message : String(error) });
  });
};
