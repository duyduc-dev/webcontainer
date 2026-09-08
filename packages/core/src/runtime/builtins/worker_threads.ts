// Hand-written, not vendored: real Node's worker_threads wraps genuine OS
// thread creation (internalBinding('worker'), a whole second V8 isolate per
// Worker). `Worker` here is a REAL, separate browser Worker spawned directly
// from the calling guest process's own Worker context - not a hand-rolled
// approximation of multi-threading - but scoped to exactly what has an actual
// traced caller, not a general nested-Node-sandbox: real rolldown's own WASM
// fallback (@rolldown/binding-wasm32-wasi, see module.ts's doc comment on
// process.versions.webcontainer) needs real node:wasi, which in turn needs
// this ONLY to implement WASI's own `thread-spawn` import - `@napi-rs/
// wasm-runtime`'s own wasi-worker.mjs (a fixed file the library ships, not
// arbitrary guest code - see PROGRESS.md) does `new Worker(filename)` purely
// to re-instantiate the SAME wasm module with SHARED memory in a new thread,
// needing only require()/fs/process/console/timers/Buffer plus
// `worker_threads.parentPort` inside that new thread - not full net/http/
// child_process/readline support, which a genuinely worker_threads-hosted
// arbitrary Node program would need but nothing has traced yet (see
// workers/workerThreads/worker.ts's own doc comment for the exact boot
// surface built there).
//
// `MessageChannel`/`MessagePort` ARE real here - they're also a standard
// Web/Worker-global API, already available natively in this environment,
// just missing Node's own `.ref()`/`.unref()` methods (which real Node's
// ports have so a live channel can opt out of keeping the process alive -
// irrelevant here since nothing in this runtime's own event loop tracks
// message ports as handles, so these are safe, real no-ops rather than an
// approximation of a semantic that doesn't apply).
const wrapPort = (port: MessagePort): MessagePort => {
  const anyPort = port as MessagePort & { unref?: () => void; ref?: () => void };
  anyPort.unref ??= () => {};
  anyPort.ref ??= () => {};
  return port;
};

class DwcMessageChannel {
  port1: MessagePort;
  port2: MessagePort;
  constructor() {
    const { port1, port2 } = new MessageChannel();
    this.port1 = wrapPort(port1);
    this.port2 = wrapPort(port2);
  }
}

interface EventEmitterLike {
  emit(event: string, ...args: unknown[]): boolean;
}

interface WorkerOptions {
  workerData?: unknown;
  env?: Record<string, string>;
}

/** What actually constructing a nested Worker needs from the calling guest
 * process: a real browser Worker running the shared workers/workerThreads/
 * worker.ts bootstrap, plus (transferred over, not relayed on an ongoing
 * basis) a fresh sync-fs channel to this project's own VFS - granted by the
 * kernel (see processClient.ts's "wt-request-sync-fs-channel" handler),
 * since a nested Worker has no fs channel of its own otherwise. `ready`
 * resolves once the channel has actually been granted and the boot message
 * sent - real message traffic before that point would arrive before the
 * nested worker has even installed its own message listener. `unref` drops
 * the liveness ref `spawnWorker` takes for as long as this worker is alive
 * (matching real Node: an active, non-unref'd Worker keeps its owner alive) -
 * without it, a guest script with no other pending work (net requests,
 * timers, ...) looks "done" the instant its own top-level code returns, and
 * this process tears itself (and every worker it spawned, including a
 * not-yet-booted one) down before the channel-grant round trip even
 * finishes - confirmed live via a real hung boot with zero errors. */
interface SpawnedWorker {
  worker: Worker;
  ready: Promise<void>;
  unref(): void;
}

/** Per-thread identity `worker_threads` reports - varies by boot() call
 * site: the top-level process worker passes `isMainThread: true` (the
 * default) with a real `spawnWorker`; the workers/workerThreads/worker.ts
 * bootstrap that RUNS INSIDE a spawned Worker passes `isMainThread: false`
 * plus its own `parentPort`/`workerData`, and no `spawnWorker` at all -
 * nothing has traced a need for a worker_threads.Worker to itself spawn a
 * further-nested one, so that throws a clear error instead of silently
 * failing deeper down. */
interface ThreadContext {
  isMainThread?: boolean;
  parentPort?: unknown;
  workerData?: unknown;
  spawnWorker?: (filename: string, options: WorkerOptions) => SpawnedWorker;
}

interface WorkerInstance extends EventEmitterLike {
  threadId: number;
  postMessage(value: unknown, transferList?: Transferable[]): void;
  terminate(): Promise<number>;
  ref(): this;
  unref(): this;
}

interface WorkerThreadsModule {
  MessageChannel: new () => { port1: MessagePort; port2: MessagePort };
  MessagePort: typeof globalThis.MessagePort;
  Worker: new (filename: string | URL, options?: WorkerOptions) => WorkerInstance;
  isMainThread: boolean;
  parentPort: unknown;
  threadId: number;
  workerData: unknown;
}

// Explicit return type (rather than inferred): DwcWorker's real ECMAScript
// #private field can't be structurally described in a declaration file for
// an exported function's INFERRED return type (TS2094) - an explicit public-
// shape-only interface sidesteps that, same reasoning as this project's
// other exported factories that hide a #private-bearing class this way.
const createWorkerThreadsModule = (EventEmitterCtor: new () => EventEmitterLike, threadContext: ThreadContext = {}): WorkerThreadsModule => {
  let nextThreadId = 1;

  class DwcWorker extends (EventEmitterCtor as new () => EventEmitterLike) {
    threadId: number;
    #worker: Worker;
    #unrefSpawn: () => void;
    #refCleared = false;
    // spawnWorker's own internal "boot" message is posted asynchronously
    // (after the one-time sync-fs-channel grant round trip - see
    // SpawnedWorker's own doc comment), but the real Worker object it
    // returns exists immediately. A caller's own postMessage() right after
    // `new Worker(...)` (the overwhelming common pattern - real code doesn't
    // wait for anything before sending the first message) would otherwise
    // race ahead of "boot" and land on a not-yet-booted worker with no
    // listener installed yet, silently dropped - confirmed live, this
    // exact race lost every message in the first end-to-end trace of this
    // feature. Queuing on `ready` guarantees "boot" (posted inside
    // spawnWorker's own `ready` callback, so it always resolves first)
    // always arrives before anything a caller sends.
    #ready: Promise<void>;

    constructor(filename: string | URL, options: WorkerOptions = {}) {
      super();
      if (!threadContext.spawnWorker) {
        throw new Error(
          "worker_threads.Worker is not supported from within a nested worker_threads.Worker in this runtime (see runtime/builtins/worker_threads.ts)",
        );
      }
      this.threadId = nextThreadId++;
      const path = filename instanceof URL ? filename.pathname : filename;
      const { worker, ready, unref } = threadContext.spawnWorker(path, options);
      this.#worker = worker;
      this.#unrefSpawn = unref;
      this.#ready = ready;
      worker.addEventListener("message", (event) => {
        const data = (event as MessageEvent).data;
        // See workers/workerThreads/worker.ts's own BOOT_ERROR_TAG doc
        // comment - a boot() failure inside the nested worker is otherwise
        // an invisible unhandled rejection (browsers only fire a Worker's
        // real error event for a synchronous throw during script
        // evaluation), reported back over this same channel instead.
        if (data && typeof data === "object" && (data as Record<string, unknown>)["__dwc_worker_threads_boot_error__"] === true) {
          (this as unknown as EventEmitterLike).emit("error", new Error((data as { message: string }).message));
          return;
        }
        (this as unknown as EventEmitterLike).emit("message", data);
      });
      worker.addEventListener("error", (event) => {
        const errorEvent = event as ErrorEvent;
        (this as unknown as EventEmitterLike).emit("error", errorEvent.error ?? new Error(errorEvent.message));
      });
      // A channel-grant failure (e.g. not cross-origin isolated) surfaces the
      // same way a real worker's own startup failure would - an 'error'
      // event, not a swallowed rejection.
      ready.catch((error: unknown) => {
        (this as unknown as EventEmitterLike).emit("error", error);
      });
    }

    postMessage(value: unknown, transferList?: Transferable[]): void {
      // Real Node's postMessage() is fire-and-forget (no returned promise) -
      // this queues on #ready internally but keeps that same synchronous-
      // looking contract for callers; a channel-grant failure surfaces via
      // the 'error' event #ready.catch() above already wires up, not here.
      this.#ready.then(() => this.#worker.postMessage(value, transferList ?? [])).catch(() => {});
    }

    #clearRef(): void {
      if (this.#refCleared) return;
      this.#refCleared = true;
      this.#unrefSpawn();
    }

    // Real Node's terminate() returns a Promise<exitCode> - this runtime has
    // no notion of a worker's own exit code (nothing traced calls process.
    // exit() from inside one; see workers/workerThreads/worker.ts's own
    // doc comment), so 0 is the only honest constant answer, matching a
    // real worker terminated from the outside (never ran its own exit path).
    terminate(): Promise<number> {
      this.#worker.terminate();
      this.#clearRef();
      return Promise.resolve(0);
    }

    ref(): this {
      return this;
    }

    // Real Node: an unref'd Worker no longer keeps its owner process alive
    // on its own - matches spawnWorker's own ref(), taken at construction so
    // a live Worker (the common case: still expected to send/receive
    // messages) doesn't let its owner process conclude "nothing left to do"
    // and tear itself down mid-flight (see SpawnedWorker's own doc comment
    // for the real hang this caused before `unref` existed).
    unref(): this {
      this.#clearRef();
      return this;
    }
  }

  return {
    MessageChannel: DwcMessageChannel,
    MessagePort: globalThis.MessagePort,
    Worker: DwcWorker,
    isMainThread: threadContext.isMainThread ?? true,
    parentPort: threadContext.parentPort ?? null,
    threadId: 0,
    workerData: threadContext.workerData ?? null,
  };
};

export { createWorkerThreadsModule };
export type { SpawnedWorker, ThreadContext, WorkerOptions };
