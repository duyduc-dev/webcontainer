import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deprecate } from "./util";

describe("util.deprecate", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("still calls the wrapped function and returns its result", () => {
    const wrapped = deprecate((x: unknown) => (x as number) * 2, "old api");
    expect(wrapped(21)).toBe(42);
  });

  it("prints the deprecation message on the first call", () => {
    const wrapped = deprecate(() => {}, "Instance method destroy() is deprecated");
    wrapped();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain("Instance method destroy() is deprecated");
  });

  it("only warns once across multiple calls (real npm's own debug dependency wraps a no-op with this and may call it repeatedly)", () => {
    const wrapped = deprecate(() => {}, "old api");
    wrapped();
    wrapped();
    wrapped();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
