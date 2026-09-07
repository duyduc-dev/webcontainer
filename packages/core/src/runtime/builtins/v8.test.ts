import { describe, expect, it } from "vitest";
import { createV8Module } from "./v8";

describe("createV8Module", () => {
  it("getHeapStatistics().heap_size_limit is a plausible positive number (real @npmcli/arborist sizes its packument cache off this)", () => {
    const v8 = createV8Module();
    const stats = v8.getHeapStatistics();
    expect(stats.heap_size_limit).toBeGreaterThan(0);
    expect(Number.isInteger(stats.heap_size_limit)).toBe(true);
  });

  it("returns the full standard shape so an untraced field destructure gets a real number, not undefined", () => {
    const v8 = createV8Module();
    const stats = v8.getHeapStatistics();
    for (const value of Object.values(stats)) {
      expect(value).not.toBeUndefined();
      expect(typeof value).toBe("number");
    }
  });
});
