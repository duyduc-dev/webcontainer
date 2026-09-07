import { describe, expect, it } from "vitest";
import { createWorkerThreadsModule } from "./worker_threads";

describe("createWorkerThreadsModule", () => {
  it("MessageChannel creates two real, connected ports (real Vite's own config-loading helper uses one to talk to a registered module hook)", async () => {
    const { MessageChannel } = createWorkerThreadsModule();
    const { port1, port2 } = new MessageChannel();

    const received = new Promise((resolve) => {
      port2.onmessage = (event: MessageEvent) => resolve(event.data);
    });
    port2.start();
    port1.postMessage("hello");

    await expect(received).resolves.toBe("hello");
  });

  it("MessageChannel's ports have real Node's own unref()/ref() methods, as safe no-ops (native browser MessagePort has neither)", () => {
    const { MessageChannel } = createWorkerThreadsModule();
    const { port1, port2 } = new MessageChannel() as unknown as {
      port1: MessagePort & { unref(): void; ref(): void };
      port2: MessagePort & { unref(): void; ref(): void };
    };

    expect(typeof port1.unref).toBe("function");
    expect(typeof port1.ref).toBe("function");
    expect(() => port1.unref()).not.toThrow();
    expect(() => port2.ref()).not.toThrow();
  });

  it("Worker throws a clear error when actually constructed, instead of silently no-op'ing (no in-VM worker-thread execution exists yet)", () => {
    const { Worker } = createWorkerThreadsModule();
    expect(() => new (Worker as unknown as new (path: string) => unknown)("/some-script.js")).toThrow(/not implemented/i);
  });

  it("exposes the other commonly-destructured top-level members with plausible values", () => {
    const mod = createWorkerThreadsModule();
    expect(mod.isMainThread).toBe(true);
    expect(mod.parentPort).toBeNull();
    expect(mod.threadId).toBe(0);
    expect(mod.workerData).toBeNull();
  });
});
