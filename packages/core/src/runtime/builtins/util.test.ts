import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deprecate, inspect, promisify } from "./util";

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

describe("util.inspect", () => {
  it("custom is the real, well-known registered symbol, not a private one (real npm's own @npmcli/arborist uses it as a computed class-method key)", () => {
    expect(inspect.custom).toBe(Symbol.for("nodejs.util.inspect.custom"));
  });

  it("a class can define [util.inspect.custom] as a method key without throwing", () => {
    class Edge {
      [inspect.custom]() {
        return "<Edge>";
      }
    }
    const edge = new Edge();
    expect(edge[inspect.custom]()).toBe("<Edge>");
  });

  it("formats a plain value as a best-effort string", () => {
    expect(inspect({ a: 1 })).toContain('"a": 1');
    expect(inspect("hi")).toBe('"hi"');
  });
});

describe("util.promisify", () => {
  it("resolves with the callback's single value (real npm's own read-cmd-shim wraps fs.readFile with this)", async () => {
    const readFile = (path: string, cb: (error: unknown, data?: string) => void) => {
      cb(null, `contents of ${path}`);
    };
    const readFileAsync = promisify(readFile);
    await expect(readFileAsync("/a.txt")).resolves.toBe("contents of /a.txt");
  });

  it("rejects with the callback's error", async () => {
    const fails = (cb: (error: unknown) => void) => cb(new Error("boom"));
    await expect(promisify(fails)()).rejects.toThrow("boom");
  });

  it("resolves with an array when the callback receives more than one value", async () => {
    const multi = (cb: (error: unknown, a?: number, b?: number) => void) => cb(null, 1, 2);
    await expect(promisify(multi)()).resolves.toEqual([1, 2]);
  });

  it("prefers a function's own util.promisify.custom implementation", async () => {
    const original = ((cb: (error: unknown) => void) => cb(new Error("should not be called"))) as ((
      cb: (error: unknown) => void,
    ) => void) & { [key: symbol]: unknown };
    original[promisify.custom] = async () => "custom result";
    await expect(promisify(original)()).resolves.toBe("custom result");
  });

  it("throws a TypeError when given a non-function", () => {
    expect(() => promisify(null as unknown as (...args: unknown[]) => unknown)).toThrow(TypeError);
  });
});
