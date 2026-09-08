import { describe, expect, it, vi } from "vitest";
import { createWorkerThreadsModule } from "./worker_threads";

/** Minimal real EventEmitter test double - DwcWorker only ever calls
 * .emit(event, ...args) on its own instance and expects real Node
 * EventEmitter semantics (multiple listeners, addEventListener-free .on()) -
 * not the full vendored class, since this file tests worker_threads.ts in
 * isolation from events.js. */
class TestEventEmitter {
  #listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  on(event: string, listener: (...args: unknown[]) => void): this {
    (this.#listeners.get(event) ?? this.#listeners.set(event, new Set()).get(event)!).add(listener);
    return this;
  }
  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this.#listeners.get(event);
    if (!listeners) return false;
    for (const listener of listeners) listener(...args);
    return listeners.size > 0;
  }
}

describe("createWorkerThreadsModule", () => {
  it("MessageChannel creates two real, connected ports (real Vite's own config-loading helper uses one to talk to a registered module hook)", async () => {
    const { MessageChannel } = createWorkerThreadsModule(TestEventEmitter);
    const { port1, port2 } = new MessageChannel();

    const received = new Promise((resolve) => {
      port2.onmessage = (event: MessageEvent) => resolve(event.data);
    });
    port2.start();
    port1.postMessage("hello");

    await expect(received).resolves.toBe("hello");
  });

  it("MessageChannel's ports have real Node's own unref()/ref() methods, as safe no-ops (native browser MessagePort has neither)", () => {
    const { MessageChannel } = createWorkerThreadsModule(TestEventEmitter);
    const { port1, port2 } = new MessageChannel() as unknown as {
      port1: MessagePort & { unref(): void; ref(): void };
      port2: MessagePort & { unref(): void; ref(): void };
    };

    expect(typeof port1.unref).toBe("function");
    expect(typeof port1.ref).toBe("function");
    expect(() => port1.unref()).not.toThrow();
    expect(() => port2.ref()).not.toThrow();
  });

  it("Worker throws a clear error when constructed with no spawn capability wired up (e.g. from inside a nested worker_threads.Worker)", () => {
    const { Worker } = createWorkerThreadsModule(TestEventEmitter);
    expect(() => new (Worker as unknown as new (path: string) => unknown)("/some-script.js")).toThrow(/not supported/i);
  });

  it("Worker spawns via the provided spawnWorker hook and relays real message/error events", async () => {
    const target = new EventTarget();
    const fakeWorker = Object.assign(target, {
      postMessage: vi.fn(),
      terminate: vi.fn(),
    }) as unknown as globalThis.Worker;
    const unref = vi.fn();
    const spawnWorker = vi.fn().mockReturnValue({ worker: fakeWorker, ready: Promise.resolve(), unref });

    const { Worker } = createWorkerThreadsModule(TestEventEmitter, { spawnWorker });
    const worker = new (Worker as unknown as new (path: string) => InstanceType<typeof TestEventEmitter> & { postMessage(v: unknown): void; terminate(): Promise<number> })("/wasi-worker.mjs");

    expect(spawnWorker).toHaveBeenCalledWith("/wasi-worker.mjs", {});

    const received = new Promise((resolve) => worker.on("message", resolve));
    target.dispatchEvent(new MessageEvent("message", { data: "hi" }));
    await expect(received).resolves.toBe("hi");

    // postMessage() queues on the (already-resolved, here) `ready` promise -
    // real callers see this as synchronous-looking, but a test needs a
    // microtask tick before the underlying worker.postMessage() actually
    // runs (see worker_threads.ts's own #ready doc comment for why this
    // queuing exists at all: it's what stops a caller's first message from
    // racing ahead of spawnWorker's own internal "boot" message).
    worker.postMessage("out");
    await Promise.resolve();
    expect(fakeWorker.postMessage).toHaveBeenCalledWith("out", []);

    await expect(worker.terminate()).resolves.toBe(0);
    expect(fakeWorker.terminate).toHaveBeenCalled();
    expect(unref).toHaveBeenCalledTimes(1);
  });

  // Real Node semantics, kept despite a known real gap this causes - see
  // this Worker's own unref() doc comment in worker_threads.ts (and
  // PROGRESS.md) for the full "real vite build hangs vs. exits early"
  // investigation: neither honoring unref() nor making it a permanent
  // no-op is fully correct with what this runtime can currently observe,
  // and a fast, clean failure (this behavior) was judged better than a
  // silent infinite hang (the no-op alternative, tried and reverted).
  it("Worker.unref() releases the spawnWorker liveness ref immediately, same as .terminate()", async () => {
    const target = new EventTarget();
    const fakeWorker = Object.assign(target, { postMessage: vi.fn(), terminate: vi.fn() }) as unknown as globalThis.Worker;
    const unref = vi.fn();
    const spawnWorker = vi.fn().mockReturnValue({ worker: fakeWorker, ready: Promise.resolve(), unref });

    const { Worker } = createWorkerThreadsModule(TestEventEmitter, { spawnWorker });
    const worker = new (Worker as unknown as new (path: string) => { unref(): void; terminate(): Promise<number> })("/x.mjs");

    worker.unref();
    worker.unref();
    expect(unref).toHaveBeenCalledTimes(1);
  });

  it("exposes the other commonly-destructured top-level members with plausible values", () => {
    const mod = createWorkerThreadsModule(TestEventEmitter);
    expect(mod.isMainThread).toBe(true);
    expect(mod.parentPort).toBeNull();
    expect(mod.threadId).toBe(0);
    expect(mod.workerData).toBeNull();
  });

  it("reflects a nested-worker thread context (isMainThread: false, real parentPort/workerData)", () => {
    const parentPort = { postMessage: vi.fn() };
    const mod = createWorkerThreadsModule(TestEventEmitter, { isMainThread: false, parentPort, workerData: { hello: "world" } });
    expect(mod.isMainThread).toBe(false);
    expect(mod.parentPort).toBe(parentPort);
    expect(mod.workerData).toEqual({ hello: "world" });
  });
});
