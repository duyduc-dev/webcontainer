import { describe, expect, it } from "vitest";
import { createErrorReply, createEvent, createReply, createRequest, isEvent, isReply } from "./envelope";

describe("envelope", () => {
  it("creates a request envelope", () => {
    const request = createRequest("1", "PING", { foo: "bar" });
    expect(request).toEqual({ id: "1", type: "PING", payload: { foo: "bar" } });
  });

  it("creates and identifies a success reply", () => {
    const reply = createReply("1", "PONG");
    expect(isReply(reply)).toBe(true);
    expect(isEvent(reply)).toBe(false);
    expect(reply).toEqual({ id: "1", ok: true, result: "PONG" });
  });

  it("creates and identifies an error reply", () => {
    const reply = createErrorReply("1", "ERR_X", "boom");
    expect(isReply(reply)).toBe(true);
    expect(reply.ok).toBe(false);
    expect(reply).toEqual({ id: "1", ok: false, error: { code: "ERR_X", message: "boom" } });
  });

  it("creates and identifies an event envelope", () => {
    const event = createEvent("ready", { at: 1 });
    expect(isEvent(event)).toBe(true);
    expect(isReply(event)).toBe(false);
    expect(event).toEqual({ type: "ready", payload: { at: 1 } });
  });
});
