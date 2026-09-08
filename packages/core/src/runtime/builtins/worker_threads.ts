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

// How long a live worker_threads.Worker must go with NO message traffic
// (sent or received) before an unref() call actually releases its liveness
// ref - see DwcWorker's own unref() doc comment for the real gap this is a
// heuristic stand-in for (this runtime has no way to observe the real N-API-
// level "is async work still in flight" signal real Node's own unref()
// safely relies on). Picked, not measured: generous enough that a real
// wasm-side computation between two messages (confirmed live to take real,
// non-trivial wall-clock time - a small real `vite build` never got AS FAR
// as a second message before the old immediate-unref cut it off) has room
// to produce its next message before the debounce fires, while still
// bounded so a worker that's genuinely gone idle for good doesn't hold the
// owning process open forever. Revisit with real timing data (how long does
// a real build's own inter-message gap actually get?) if this proves too
// short (an otherwise-working build still cut off) or too long (a
// genuinely-idle process taking noticeably longer to exit than it should).
const UNREF_DEBOUNCE_MS = 3000;

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
    // Set only while an unref()-triggered debounce window is running (see
    // UNREF_DEBOUNCE_MS's own doc comment) - undefined the rest of the time,
    // including after it fires and actually releases the ref.
    #unrefDebounce: ReturnType<typeof setTimeout> | undefined;

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
        // Real message traffic is real, direct evidence this worker still
        // has something to do - extends a running debounce window the same
        // way postMessage() below does (see UNREF_DEBOUNCE_MS's own doc
        // comment).
        this.#extendDebounce();
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
      // Sending a message is just as much "still doing something" as
      // receiving one - extends a running debounce window the same way the
      // "message" listener above does.
      this.#extendDebounce();
      // Real Node's postMessage() is fire-and-forget (no returned promise) -
      // this queues on #ready internally but keeps that same synchronous-
      // looking contract for callers; a channel-grant failure surfaces via
      // the 'error' event #ready.catch() above already wires up, not here.
      this.#ready.then(() => this.#worker.postMessage(value, transferList ?? [])).catch(() => {});
    }

    /** Restarts the debounce window if one is currently running (real
     * message traffic during the window is exactly the "still alive"
     * evidence UNREF_DEBOUNCE_MS exists to wait for) - a no-op if unref()
     * hasn't been called, or already fired and released the ref, matching
     * real Node's own postMessage()/message-handling needing no ref-related
     * side effect at all when the worker was never unref'd in the first
     * place. */
    #extendDebounce(): void {
      if (this.#unrefDebounce === undefined) return;
      clearTimeout(this.#unrefDebounce);
      this.#unrefDebounce = setTimeout(() => {
        this.#unrefDebounce = undefined;
        this.#clearRef();
      }, UNREF_DEBOUNCE_MS);
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
      if (this.#unrefDebounce !== undefined) {
        clearTimeout(this.#unrefDebounce);
        this.#unrefDebounce = undefined;
      }
      this.#worker.terminate();
      this.#clearRef();
      return Promise.resolve(0);
    }

    // Cancels a running debounce window outright (real Node: re-ref'ing an
    // unref'd-but-still-alive Worker immediately restores full keep-alive
    // status, no waiting). Does NOT re-acquire the ref if the debounce
    // already fired and released it - nothing traced calls ref() after
    // unref() on the one real caller this runtime has (real @napi-rs/
    // wasm-runtime's own worker pool unrefs once and never looks back), so
    // that combination is a known, deliberately unhandled edge rather than
    // a traced need.
    ref(): this {
      if (this.#unrefDebounce !== undefined) {
        clearTimeout(this.#unrefDebounce);
        this.#unrefDebounce = undefined;
      }
      return this;
    }

    // HEURISTIC, not a considered-correct implementation - see PROGRESS.md's
    // own entry on this for the full investigation. Real Node's unref()'d
    // Worker stops keeping its OWNER alive on its own because a SEPARATE
    // primitive (a libuv-level async handle backing whatever in-flight
    // native N-API work the worker is doing, plus Emscripten's own
    // runtime-keepalive counter - both confirmed present in real
    // @napi-rs/wasm-runtime's own compiled output) independently keeps the
    // real event loop alive for as long as that work is actually pending.
    // This runtime's own event loop has no equivalent second signal, only
    // this Worker's own liveness ref, and neither of the two "honor it
    // exactly" extremes is correct:
    //   - Releasing the ref immediately (real Node semantics) let a real
    //     `vite build` exit successfully after its very first output line,
    //     with no dist/ ever written - the pool worker's own real unref()
    //     call (real @napi-rs/wasm-runtime unrefs every pool worker
    //     immediately, a legitimate idle-efficiency pattern there) released
    //     the only signal keeping the process alive before the real
    //     bundling work even started. Confirmed live, repeatedly.
    //   - NEVER releasing it (tried, reverted) traded that for a WORSE
    //     failure: a genuine infinite hang, confirmed live across two
    //     separate runs (5 minutes, then 10 minutes; zero progress past the
    //     same first line either way) - real Node processes exit once a
    //     build's real async work finishes SPECIFICALLY because those pool
    //     workers are unref'd; ignoring that permanently means nothing this
    //     runtime can observe ever signals "done."
    // This debounces instead: the ref is released only after
    // UNREF_DEBOUNCE_MS of silence on this worker (see its own doc comment
    // for the exact window and the reasoning behind it), extended by any
    // real message traffic in the meantime (#extendDebounce(), wired into
    // both the "message" listener and postMessage() above) - a real, if
    // imperfect, proxy for "is this worker still doing something" built
    // from the one signal this runtime can actually observe (message
    // activity), not the one real Node relies on (the actual N-API-level
    // ref this runtime has no hook into).
    //
    // RE-VERIFIED LIVE against a real `vite build`, instrumented down to
    // individual eventLoop.setTimeout/clearTimeout calls and every message
    // sent/received on the pool worker: the debounce mechanism itself is
    // correct - it inserts and holds a real pending timer, and #extendDebounce()
    // correctly resets it on each of this side's own outgoing postMessage()
    // calls (confirmed: two real extensions, one for @napi-rs/wasm-runtime's
    // own "load" message handing over the wasm module + shared memory, one
    // for its "start" message kicking off thread id 43). It is NOT what's
    // breaking the build. What actually happens: after "start" is sent, the
    // nested WASI pool worker (workers/workerThreads/worker.ts running
    // wasi-worker.mjs) never sends anything back - no ack, no error, nothing
    // - for as long as this was tested (widened to 20s and 60s live, same
    // result both times: the debounce timer simply runs out its full window
    // with zero further traffic, then fires and releases the ref). Widening
    // this value further will NOT fix a real `vite build` - the real bug is
    // a silent stall somewhere in WASI thread-spawn execution after "start"
    // (wasi-worker.mjs's own message handling, this project's parentPort
    // relay, or the actual wasm thread entry point never returning/replying),
    // not anything ref-related. See PROGRESS.md for the full evidence trail;
    // that stall is the next thing to chase, separately from this heuristic.
    unref(): this {
      if (this.#refCleared || this.#unrefDebounce !== undefined) return this;
      this.#unrefDebounce = setTimeout(() => {
        this.#unrefDebounce = undefined;
        this.#clearRef();
      }, UNREF_DEBOUNCE_MS);
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

export { createWorkerThreadsModule, UNREF_DEBOUNCE_MS };
export type { SpawnedWorker, ThreadContext, WorkerOptions };
