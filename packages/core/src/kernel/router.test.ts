import { describe, expect, it } from "vitest";
import { DWCError } from "../protocol/errors";
import { createRouter } from "./router";

describe("router", () => {
  it("dispatches to a registered handler and returns its result", async () => {
    const router = createRouter();
    router.handle("PING", () => "PONG");

    await expect(router.dispatch("PING", undefined)).resolves.toBe("PONG");
  });

  it("awaits an async handler and forwards the payload", async () => {
    const router = createRouter();
    router.handle("ECHO", async (payload) => `got:${payload}`);

    await expect(router.dispatch("ECHO", "x")).resolves.toBe("got:x");
  });

  it("rejects with ERR_NOT_IMPLEMENTED for an unregistered type", async () => {
    const router = createRouter();

    await expect(router.dispatch("UNKNOWN", undefined)).rejects.toMatchObject({
      code: "ERR_NOT_IMPLEMENTED",
    });
  });

  it("propagates a DWCError thrown by a handler", async () => {
    const router = createRouter();
    router.handle("FAIL", () => {
      throw new DWCError("ERR_X", "boom");
    });

    await expect(router.dispatch("FAIL", undefined)).rejects.toBeInstanceOf(DWCError);
  });

  it("propagates a rejection from an async handler", async () => {
    const router = createRouter();
    router.handle("FAIL_ASYNC", async () => {
      throw new DWCError("ERR_Y", "async boom");
    });

    await expect(router.dispatch("FAIL_ASYNC", undefined)).rejects.toMatchObject({ code: "ERR_Y" });
  });

  it("a later handle() call for the same type replaces the earlier handler", async () => {
    const router = createRouter();
    router.handle("PING", () => "first");
    router.handle("PING", () => "second");

    await expect(router.dispatch("PING", undefined)).resolves.toBe("second");
  });
});
