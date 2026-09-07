import { describe, expect, it, vi } from "vitest";
import { createProcessAPI } from "./Process";

type Handler = (payload?: any) => void;
type Requester = <T = unknown>(type: string, payload?: unknown) => Promise<T>;

/** A minimal in-memory request/event bus standing in for the real kernel
 * bridge - lets a test fire "process:exit" etc. as if the kernel worker had
 * sent it, without a real Worker. */
const fakeBridge = () => {
  const listeners = new Map<string, Set<Handler>>();
  const request = vi.fn(async (type: string, payload?: unknown) => {
    if (type === "PROCESS_SPAWN") return { processId: "p1" };
    return undefined;
  }) as unknown as Requester & ReturnType<typeof vi.fn>;
  const on = (type: string, handler: Handler) => {
    let set = listeners.get(type);
    if (!set) listeners.set(type, (set = new Set()));
    set.add(handler);
    return () => set!.delete(handler);
  };
  const emit = (type: string, payload?: unknown) => listeners.get(type)?.forEach((handler) => handler(payload));
  return { request, on, emit };
};

describe("createProcessAPI - kill()", () => {
  it("sends PROCESS_KILL for the spawned process's id", async () => {
    const bridge = fakeBridge();
    const api = createProcessAPI(bridge.request, bridge.on);

    const handle = await api.spawn("/index.js");
    handle.kill();

    expect(bridge.request).toHaveBeenCalledWith("PROCESS_KILL", { processId: "p1" });
  });

  it("resolves .exit once the kernel reports the process:exit this kill() caused", async () => {
    const bridge = fakeBridge();
    const api = createProcessAPI(bridge.request, bridge.on);

    const handle = await api.spawn("/index.js");
    handle.kill();
    bridge.emit("process:exit", { processId: "p1", code: 143 });

    await expect(handle.exit).resolves.toBe(143);
  });

  it("never rejects even if the underlying request fails - fire-and-forget, matching stdin()", async () => {
    const bridge = fakeBridge();
    bridge.request.mockImplementation(async (type: string) => {
      if (type === "PROCESS_SPAWN") return { processId: "p1" };
      throw new Error("boom");
    });
    const api = createProcessAPI(bridge.request, bridge.on);

    const handle = await api.spawn("/index.js");
    expect(() => handle.kill()).not.toThrow();
  });
});
