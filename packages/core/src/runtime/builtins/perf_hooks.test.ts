import { describe, expect, it } from "vitest";
import { createPerfHooksModule } from "./perf_hooks";

describe("createPerfHooksModule", () => {
  it("performance.now() returns a monotonically non-decreasing number of milliseconds (real Vite's own CLI entry point calls this for its startup-timing log line)", () => {
    const { performance } = createPerfHooksModule();
    const first = performance.now();
    const second = performance.now();
    expect(typeof first).toBe("number");
    expect(second).toBeGreaterThanOrEqual(first);
  });

  it("timeOrigin is a real, positive timestamp", () => {
    const { performance } = createPerfHooksModule();
    expect(performance.timeOrigin).toBeGreaterThan(0);
  });
});
