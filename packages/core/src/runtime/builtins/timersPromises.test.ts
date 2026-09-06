import { describe, expect, it } from "vitest";
import { createTimersPromisesModule } from "./timersPromises";

describe("timers/promises setTimeout", () => {
  it("resolves with the given value after the delay", async () => {
    const timers = createTimersPromisesModule();
    await expect(timers.setTimeout(1, "done")).resolves.toBe("done");
  });

  it("resolves with undefined when no value is given", async () => {
    const timers = createTimersPromisesModule();
    await expect(timers.setTimeout(1)).resolves.toBeUndefined();
  });

  it("rejects with an AbortError if the signal is already aborted", async () => {
    const timers = createTimersPromisesModule();
    const controller = new AbortController();
    controller.abort();

    await expect(timers.setTimeout(1000, null, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects with an AbortError if the signal aborts before the delay elapses (real npm's own @npmcli/agent races this against a connection attempt)", async () => {
    const timers = createTimersPromisesModule();
    const controller = new AbortController();
    const promise = timers.setTimeout(10_000, null, { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("resolves normally when the signal never aborts", async () => {
    const timers = createTimersPromisesModule();
    const controller = new AbortController();
    await expect(timers.setTimeout(1, "ok", { signal: controller.signal })).resolves.toBe("ok");
  });
});
