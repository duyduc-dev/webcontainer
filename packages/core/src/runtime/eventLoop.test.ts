import { describe, expect, it } from "vitest";
import { createEventLoop } from "./eventLoop";

const drain = async (loop: ReturnType<typeof createEventLoop>): Promise<void> => {
  while (loop.hasPendingWork()) {
    const didWork = await loop.runOnce();
    if (!didWork) break;
  }
};

describe("eventLoop", () => {
  it("runs nextTick before timers and immediates", async () => {
    const order: string[] = [];
    const loop = createEventLoop();

    loop.setImmediate(() => order.push("immediate"));
    loop.setTimeout(() => order.push("timeout"), 0);
    loop.nextTick(() => order.push("nextTick"));

    await drain(loop);

    expect(order).toEqual(["nextTick", "timeout", "immediate"]);
  });

  it("drains nextTicks scheduled by another nextTick before moving to the next phase", async () => {
    const order: string[] = [];
    const loop = createEventLoop();

    loop.nextTick(() => {
      order.push("a");
      loop.nextTick(() => order.push("b"));
    });
    loop.setImmediate(() => order.push("immediate"));

    await drain(loop);

    expect(order).toEqual(["a", "b", "immediate"]);
  });

  it("lets a native microtask run between the nextTick queue and the next phase", async () => {
    const order: string[] = [];
    const loop = createEventLoop();

    loop.nextTick(() => {
      order.push("nextTick");
      Promise.resolve().then(() => order.push("promise"));
    });
    loop.setImmediate(() => order.push("immediate"));

    await drain(loop);

    expect(order).toEqual(["nextTick", "promise", "immediate"]);
  });

  it("skips a timer that is not yet due but still runs a pending immediate", async () => {
    const order: string[] = [];
    let currentTime = 0;
    const loop = createEventLoop({ now: () => currentTime });

    loop.setTimeout(() => order.push("timeout"), 100);
    loop.setImmediate(() => order.push("immediate"));

    const didWork = await loop.runOnce();
    expect(didWork).toBe(true);
    expect(order).toEqual(["immediate"]);
    expect(loop.hasPendingWork()).toBe(true);

    currentTime = 100;
    const didWork2 = await loop.runOnce();
    expect(didWork2).toBe(true);
    expect(order).toEqual(["immediate", "timeout"]);
    expect(loop.hasPendingWork()).toBe(false);
  });

  it("runOnce returns false when nothing is ready yet", async () => {
    const loop = createEventLoop({ now: () => 0 });
    loop.setTimeout(() => {}, 1000);

    const didWork = await loop.runOnce();

    expect(didWork).toBe(false);
    expect(loop.hasPendingWork()).toBe(true);
  });

  it("runs close callbacks after immediates but before the loop considers itself done", async () => {
    const order: string[] = [];
    const loop = createEventLoop();

    loop.setImmediate(() => order.push("immediate"));
    loop.queueClose(() => order.push("close"));
    loop.nextTick(() => order.push("nextTick"));

    await drain(loop);

    expect(order).toEqual(["nextTick", "immediate", "close"]);
  });

  it("orders a handle's close after its own error, matching net.Socket._destroy's close(cb2)-then-cb(err) sequence", async () => {
    // Regression guard for the exact bug queueClose exists for: if a close
    // callback ran on the plain nextTick queue instead of its own later
    // phase, it would fire before an 'error' emitted synchronously right
    // after handle.close(cb2) was called - the reverse of real Node.
    const order: string[] = [];
    const loop = createEventLoop();

    loop.queueClose(() => order.push("close"));
    order.push("error"); // emitted synchronously, before any tick runs

    await drain(loop);

    expect(order).toEqual(["error", "close"]);
  });

  it("queueClose() keeps hasPendingWork() true until it runs", async () => {
    const loop = createEventLoop();
    expect(loop.hasPendingWork()).toBe(false);

    loop.queueClose(() => {});
    expect(loop.hasPendingWork()).toBe(true);

    await loop.runOnce();
    expect(loop.hasPendingWork()).toBe(false);
  });

  it("ref() keeps hasPendingWork() true with nothing else queued", () => {
    const loop = createEventLoop();
    expect(loop.hasPendingWork()).toBe(false);

    loop.ref();
    expect(loop.hasPendingWork()).toBe(true);

    loop.unref();
    expect(loop.hasPendingWork()).toBe(false);
  });

  it("unref() never goes negative", () => {
    const loop = createEventLoop();
    loop.unref();
    loop.unref();
    loop.ref();
    expect(loop.hasPendingWork()).toBe(true);
    loop.unref();
    expect(loop.hasPendingWork()).toBe(false);
  });

  it("drain() waits on an active handle instead of exiting early, and proceeds once a reply arrives", async () => {
    const order: string[] = [];
    const loop = createEventLoop();

    loop.ref();
    // Simulates a reply arriving asynchronously later (e.g. a network response
    // delivered via postMessage from another worker) - nothing queues a
    // nextTick/timer/immediate of its own until this fires.
    setTimeout(() => {
      order.push("reply");
      loop.nextTick(() => order.push("continuation"));
      loop.unref();
    }, 0);

    await drain(loop);

    expect(order).toEqual(["reply", "continuation"]);
    expect(loop.hasPendingWork()).toBe(false);
  });

  it("clearTimeout and clearImmediate cancel pending work", async () => {
    const order: string[] = [];
    const loop = createEventLoop();

    const timeoutId = loop.setTimeout(() => order.push("timeout"), 0);
    const immediateId = loop.setImmediate(() => order.push("immediate"));
    loop.clearTimeout(timeoutId);
    loop.clearImmediate(immediateId);

    await drain(loop);

    expect(order).toEqual([]);
    expect(loop.hasPendingWork()).toBe(false);
  });
});
