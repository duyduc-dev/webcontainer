import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnChildWorker } from "./spawn";

describe("spawnChildWorker", () => {
  const originalWorker = globalThis.Worker;

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  it("constructs a worker with the given name", () => {
    const FakeWorker = vi.fn();
    globalThis.Worker = FakeWorker as unknown as typeof Worker;

    spawnChildWorker("worker.js", { name: "FsWorker" });

    expect(FakeWorker).toHaveBeenCalledWith("worker.js", { type: "module", name: "FsWorker" });
  });

  it("wraps a construction failure as DWCError(ERR_WORKER)", () => {
    class ThrowingWorker {
      constructor() {
        throw new Error("boom");
      }
    }
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = ThrowingWorker;

    expect(() => spawnChildWorker("worker.js", { name: "FsWorker" })).toThrow(
      expect.objectContaining({ code: "ERR_WORKER" }),
    );
  });
});
