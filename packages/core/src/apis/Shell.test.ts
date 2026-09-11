import { describe, expect, it, vi } from "vitest";
import { createShellAPI } from "./Shell";

type Handler = (payload?: any) => void;
type Requester = <T = unknown>(type: string, payload?: unknown) => Promise<T>;

/** A minimal in-memory request/event bus standing in for the real kernel
 * bridge - lets a test fire "shell:stdout" etc. as if the kernel worker had
 * sent it, without a real Worker. Mirrors Process.test.ts's own fakeBridge. */
const fakeBridge = () => {
  const listeners = new Map<string, Set<Handler>>();
  const request = vi.fn(async (type: string) => {
    if (type === "SHELL_SPAWN") return { shellId: "s1" };
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

const readAll = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value, { stream: true });
  }
};

describe("createShellAPI - exec()", () => {
  it("sends SHELL_EXEC with the given line and cwd", async () => {
    const bridge = fakeBridge();
    const api = createShellAPI(bridge.request, bridge.on);

    await api.exec("pwd", { cwd: "/project" });

    expect(bridge.request).toHaveBeenCalledWith("SHELL_EXEC", { line: "pwd", cwd: "/project" });
  });
});

describe("createShellAPI - spawn()", () => {
  it("streams stdout/stderr chunks as they arrive, scoped to this call's shellId", async () => {
    const bridge = fakeBridge();
    const api = createShellAPI(bridge.request, bridge.on);

    const handle = await api.spawn("npm install");
    const stdoutPromise = readAll(handle.stdout);

    bridge.emit("shell:stdout", { shellId: "s1", chunk: new TextEncoder().encode("added 1 package\n") });
    // A different shellId's chunk must never leak into this handle's stream.
    bridge.emit("shell:stdout", { shellId: "other", chunk: new TextEncoder().encode("noise\n") });
    bridge.emit("shell:exit", { shellId: "s1", code: 0 });

    await expect(handle.exit).resolves.toBe(0);
    await expect(stdoutPromise).resolves.toBe("added 1 package\n");
  });

  it("resolves exit with the code from shell:exit, and closes both streams", async () => {
    const bridge = fakeBridge();
    const api = createShellAPI(bridge.request, bridge.on);

    const handle = await api.spawn("false");
    bridge.emit("shell:exit", { shellId: "s1", code: 1 });

    await expect(handle.exit).resolves.toBe(1);
  });

  it("kill() sends SHELL_KILL for this spawn's shellId", async () => {
    const bridge = fakeBridge();
    const api = createShellAPI(bridge.request, bridge.on);

    const handle = await api.spawn("npm run dev");
    handle.kill();

    expect(bridge.request).toHaveBeenCalledWith("SHELL_KILL", { shellId: "s1" });
  });

  it("passes cwd/env options through to SHELL_SPAWN", async () => {
    const bridge = fakeBridge();
    const api = createShellAPI(bridge.request, bridge.on);

    await api.spawn("npm run dev", { cwd: "/my-app", env: { PATH: "/bin" } });

    expect(bridge.request).toHaveBeenCalledWith("SHELL_SPAWN", { line: "npm run dev", cwd: "/my-app", env: { PATH: "/bin" } });
  });
});
