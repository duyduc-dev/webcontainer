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
