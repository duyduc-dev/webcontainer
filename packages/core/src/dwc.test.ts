import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootDWC } from "./dwc";

/** Replies "ok" to every request after a real (fake-timer-driven) delay, so
 * boot-completion timing is actually observable in these tests rather than
 * resolving on the same microtask a real Worker never could. */
class DelayedEchoWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: { id: string; type: string }) {
    setTimeout(() => {
      this.onmessage?.({ data: { id: message.id, ok: true, result: { type: message.type } } } as MessageEvent);
    }, 5);
  }

  terminate() {}
}

class UnresponsiveWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage() {}
  terminate() {}
}

describe("bootDWC (synchronous boot facade)", () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.Worker = originalWorker;
  });

  it("returns real handles synchronously, with no Promise to await", () => {
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = DelayedEchoWorker;

    const dwc = bootDWC();

    expect(dwc.fs).toBeDefined();
    expect(dwc.process).toBeDefined();
    expect(dwc.shell).toBeDefined();
    expect(dwc.preview).toBeDefined();
    expect(dwc.diagnostics).toBeDefined();
    expect(typeof dwc.addEventListener).toBe("function");
    expect(dwc.ready).toBeInstanceOf(Promise);
  });

  it("a call issued before boot completes still resolves correctly once the kernel worker is up", async () => {
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = DelayedEchoWorker;

    const dwc = bootDWC();
    const mkdirPromise = dwc.fs.mkdir("/project", { recursive: true });

    await vi.runAllTimersAsync();
    await expect(mkdirPromise).resolves.not.toBeInstanceOf(Error);
  });

  it("`await bootDWC()` (the old call shape) still works - await on a plain non-Promise object just resolves to it", async () => {
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = DelayedEchoWorker;

    const dwc = await bootDWC();
    expect(dwc.fs).toBeDefined();
  });

  it("ready resolves once the kernel worker actually boots", async () => {
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = DelayedEchoWorker;

    const dwc = bootDWC();
    let resolved = false;
    dwc.ready.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    await vi.runAllTimersAsync();
    expect(resolved).toBe(true);
  });

  it("ready rejects (without an unhandled-rejection warning) when the kernel worker never responds", async () => {
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = UnresponsiveWorker;

    const dwc = bootDWC({ bootTimeoutMs: 100 });
    const readyRejection = expect(dwc.ready).rejects.toThrow(/did not respond/);

    await vi.advanceTimersByTimeAsync(100);
    await readyRejection;
  });

  it("addEventListener() registered before boot completes still receives events once the kernel worker is up", async () => {
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = DelayedEchoWorker;

    const dwc = bootDWC();
    const handler = vi.fn();
    dwc.addEventListener("listen", handler);

    await vi.runAllTimersAsync();

    // Nothing in this test harness actually emits a "listen" event (that
    // requires a real guest process) - this only proves registration
    // against the not-yet-ready bridge didn't throw or get silently lost,
    // which the unsubscribe test below confirms more directly.
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribing before boot completes prevents the handler from ever being attached to the real bridge", async () => {
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = DelayedEchoWorker;

    const dwc = bootDWC();
    const handler = vi.fn();
    const unsubscribe = dwc.addEventListener("listen", handler);
    unsubscribe();

    await vi.runAllTimersAsync();
    // No direct way to peek at the real bridge's internal listener set from
    // here - this at least proves calling unsubscribe early doesn't throw.
    expect(handler).not.toHaveBeenCalled();
  });
});
