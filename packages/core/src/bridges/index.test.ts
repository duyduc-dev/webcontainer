import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKernelBridge } from "./index";

class UnresponsiveWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage() {}
  terminate() {}
}

class EchoWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: { id: string; type: string }) {
    if (message.type === "PING") {
      queueMicrotask(() => {
        this.onmessage?.({ data: { id: message.id, ok: true, result: "PONG" } } as MessageEvent);
      });
    }
  }

  terminate() {}
}

describe("createKernelBridge", () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.Worker = originalWorker;
  });

  it("resolves boot once the kernel worker replies to the initial ping", async () => {
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = EchoWorker;

    const bridge = await createKernelBridge();

    expect(bridge).toBeDefined();
    expect(typeof bridge.request).toBe("function");
    expect(typeof bridge.on).toBe("function");
  });

  it("rejects with ERR_BOOT_TIMEOUT when the kernel worker never replies", async () => {
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = UnresponsiveWorker;

    const bridgePromise = createKernelBridge({ bootTimeoutMs: 1000 });
    const assertion = expect(bridgePromise).rejects.toMatchObject({ code: "ERR_BOOT_TIMEOUT" });

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});
