import { describe, expect, it, vi } from "vitest";
import { createDiagnostics } from "./diagnostics";

describe("diagnostics", () => {
  it("notifies subscribed handlers with a timestamped event", () => {
    const diagnostics = createDiagnostics();
    const handler = vi.fn();
    diagnostics.onEvent(handler);

    diagnostics.log("ping", { foo: 1 });

    expect(handler).toHaveBeenCalledTimes(1);
    const [event] = handler.mock.calls[0];
    expect(event.type).toBe("ping");
    expect(event.payload).toEqual({ foo: 1 });
    expect(typeof event.timestamp).toBe("number");
  });

  it("stops notifying after unsubscribe", () => {
    const diagnostics = createDiagnostics();
    const handler = vi.fn();
    const unsubscribe = diagnostics.onEvent(handler);
    unsubscribe();

    diagnostics.log("ping");

    expect(handler).not.toHaveBeenCalled();
  });

  it("replays buffered history to a subscriber that attaches late", () => {
    const diagnostics = createDiagnostics();
    diagnostics.log("ping");
    diagnostics.log("pong", { ok: true });

    const handler = vi.fn();
    diagnostics.onEvent(handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][0].type).toBe("ping");
    expect(handler.mock.calls[1][0]).toMatchObject({ type: "pong", payload: { ok: true } });
  });
});
