import { describe, expect, it } from "vitest";
import { createEventLoop } from "./eventLoop";

const drain = async (loop: ReturnType<typeof createEventLoop>): Promise<void> => {
  while (loop.hasPendingWork()) {
    const didWork = await loop.runOnce();
    if (!didWork) break;
  }
};

// Mirrors worker.ts's own drain() - see its comment for why this grace
// period exists: a guest script's own plain `await somePromise()` chain
// built entirely on native promises is invisible to hasPendingWork(), so a
// naive drain() (the plain `drain` above) tears the loop down mid-chain.
const GRACE_YIELDS = 20;
const drainWithGrace = async (loop: ReturnType<typeof createEventLoop>): Promise<void> => {
  let idleStreak = 0;
  while (idleStreak <= GRACE_YIELDS) {
    if (loop.hasPendingWork()) {
      idleStreak = 0;
      const didWork = await loop.runOnce();
      if (!didWork) break;
      continue;
    }
    idleStreak++;
    await loop.yieldToMicrotasks();
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

  it("yieldToMicrotasks() resolves only after every currently-queued microtask has run, including ones enqueued while draining earlier ones", async () => {
    const loop = createEventLoop();
    const order: string[] = [];

    // A chain of plain native promises with no nextTick/timer/immediate of
    // ours anywhere in it - hasPendingWork() can't see any of this.
    void Promise.resolve()
      .then(() => {
        order.push("a");
        return Promise.resolve();
      })
      .then(() => {
        order.push("b");
        return Promise.resolve();
      })
      .then(() => order.push("c"));

    expect(order).toEqual([]);
    await loop.yieldToMicrotasks();
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("a naive drain() (no grace period) abandons a guest script's plain native-promise chain once nothing is tracked", async () => {
    // This is the bug the grace period below fixes, reproduced directly:
    // real npm's own which()->isexe()->fs.promises.stat() shape is exactly
    // "one tracked hop, then several chained plain `await`s with nothing of
    // ours in between."
    const loop = createEventLoop();
    const order: string[] = [];

    loop.nextTick(() => {
      order.push("tracked");
      void Promise.resolve()
        .then(() => order.push("untracked-1"))
        .then(() => order.push("untracked-2"))
        .then(() => order.push("untracked-3"))
        .then(() => order.push("untracked-4"));
    });

    await drain(loop);

    expect(order.length).toBeLessThan(5); // some (real npm's own chains ran even more) of the untracked continuations never ran
  });

  it("drain()'s grace period lets that same chain finish instead of abandoning it", async () => {
    const loop = createEventLoop();
    const order: string[] = [];

    loop.nextTick(() => {
      order.push("tracked");
      void Promise.resolve()
        .then(() => order.push("untracked-1"))
        .then(() => order.push("untracked-2"));
    });

    await drainWithGrace(loop);

    expect(order).toEqual(["tracked", "untracked-1", "untracked-2"]);
  });

  it("the grace period resumes normal processing if the untracked chain schedules real tracked work partway through", async () => {
    const loop = createEventLoop();
    const order: string[] = [];

    loop.nextTick(() => {
      order.push("first");
      // A chain that eventually calls back into one of our own tracked
      // primitives (e.g. a second require()'d fs.promises call) partway
      // through - hasPendingWork() should pick it back up.
      void Promise.resolve().then(() => {
        order.push("untracked");
        loop.nextTick(() => order.push("second-tracked"));
      });
    });

    await drainWithGrace(loop);

    expect(order).toEqual(["first", "untracked", "second-tracked"]);
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
