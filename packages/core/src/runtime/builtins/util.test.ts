import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import utilModule, { deprecate, inspect, promisify, styleText, stripVTControlCharacters, parseEnv } from "./util";

describe("util.TextEncoder/TextDecoder", () => {
  // Real npm's own react-dom/server output does
  // `new (require('util').TextEncoder)()` rather than relying on the global
  // - traced need found running a real npm-installed react-dom/server.
  it("are the same real, standard constructors as the globals (a passthrough, not a reimplementation)", () => {
    expect(utilModule.TextEncoder).toBe(globalThis.TextEncoder);
    expect(utilModule.TextDecoder).toBe(globalThis.TextDecoder);
  });

  it("actually work when constructed and called through util's own reference", () => {
    const bytes = new utilModule.TextEncoder().encode("hello");
    expect(new utilModule.TextDecoder().decode(bytes)).toBe("hello");
  });
});

describe("util.types", () => {
  // Traced need: real npm-installed code commonly does
  // `require('util').types.isUint8Array(...)` as one property access off
  // the main util module, not a separate `require('util/types')` import -
  // that top-level specifier was already vendored (node/internal/util/
  // types.js, registered in node/loader.ts) but never exposed as a
  // property of this hand-written util builtin, so `util.types` was
  // undefined and any such call crashed with "Cannot read properties of
  // undefined (reading 'isUint8Array')" - found running a real installed
  // vite.js, deep in its own dependency tree.
  it("exposes the same real type predicates as util/types, as a property of the main util module", () => {
    expect(utilModule.types.isUint8Array(new Uint8Array(1))).toBe(true);
    expect(utilModule.types.isUint8Array([1, 2, 3])).toBe(false);
    expect(utilModule.types.isDate(new Date())).toBe(true);
    expect(utilModule.types.isRegExp(/x/)).toBe(true);
    expect(utilModule.types.isPromise(Promise.resolve())).toBe(true);
  });
});

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

  // Traced need: real Vite's own CLI does exactly `` `error during
  // build:\n${inspect(e)}` `` around its top-level try/catch - before this
  // fix, `JSON.stringify(error)` silently produced "{}" for every real
  // build failure (Error's own message/stack are non-enumerable, so
  // JSON.stringify skips both), regardless of what actually went wrong.
  // Found live running a real installed vite.js build.
  it("formats an Error as its real stack trace, not '{}' (message/stack are non-enumerable, invisible to JSON.stringify)", () => {
    const error = new Error("boom");
    const formatted = inspect(error);
    expect(formatted).not.toBe("{}");
    expect(formatted).toContain("Error: boom");
  });

  it("appends an Error's extra own enumerable properties (e.g. .code) as a trailing block, matching real Node's own format", () => {
    const error = Object.assign(new Error("boom"), { code: "EFOO" });
    const formatted = inspect(error);
    expect(formatted).toContain("Error: boom");
    expect(formatted).toContain("code:");
    expect(formatted).toContain("EFOO");
  });

  it("recurses into a .cause chain (real rolldown's own WebContainer-fallback error shape) instead of hitting the same '{}' bug one level down", () => {
    const error = Object.assign(new Error("outer"), { cause: new Error("inner") });
    const formatted = inspect(error);
    expect(formatted).toContain("Error: outer");
    expect(formatted).toContain("Error: inner");
    expect(formatted).not.toContain("{}");
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

describe("util.styleText", () => {
  // Traced need: real Vite's own CLI version-print path calls this
  // directly. This runtime's process.stdout.isTTY is always false (see
  // worker.ts's createWritableStream), so by default (validateStream: true,
  // matching real Node) styleText no-ops on the default stream - same as
  // real Node piping into a non-TTY.
  it("returns the text unchanged against a non-TTY stream (this runtime's real process.stdout.isTTY)", () => {
    expect(styleText("red", "hello", { stream: { isTTY: false } })).toBe("hello");
  });

  it("wraps the text in the named style's real ANSI codes when the stream IS a TTY", () => {
    expect(styleText("red", "hello", { stream: { isTTY: true } })).toBe("[31mhello[39m");
  });

  it("applies multiple styles, closing them in reverse order", () => {
    expect(styleText(["bold", "red"], "hi", { stream: { isTTY: true } })).toBe("[1m[31mhi[39m[22m");
  });

  it("skips the TTY check entirely when validateStream is false", () => {
    expect(styleText("red", "hello", { validateStream: false })).toBe("[31mhello[39m");
  });

  it("throws for an unknown style name", () => {
    expect(() => styleText("not-a-real-style", "hi", { validateStream: false })).toThrow(TypeError);
  });
});

// Traced need: real Vite's own CLI does
// `import { stripVTControlCharacters } from 'node:util'` at its top level.
describe("util.stripVTControlCharacters", () => {
  it("removes the ANSI codes styleText itself produces, leaving the plain text", () => {
    const styled = styleText("red", "hello", { validateStream: false });
    expect(stripVTControlCharacters(styled)).toBe("hello");
  });

  it("leaves plain text with no escape codes unchanged", () => {
    expect(stripVTControlCharacters("plain text")).toBe("plain text");
  });
});

// Traced need: real Vite's own CLI does `import { parseEnv } from 'node:util'`
// at its top level for its own --envFile support.
describe("util.parseEnv", () => {
  it("parses plain KEY=VALUE pairs, ignoring blank lines and # comments", () => {
    expect(parseEnv("# a comment\nFOO=bar\n\nBAZ=qux\n")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("strips matching single/double/backtick quotes from a value", () => {
    expect(parseEnv('A="hello"\nB=\'world\'\nC=`back`')).toEqual({ A: "hello", B: "world", C: "back" });
  });

  it("unescapes \\n and \\r only inside double-quoted values", () => {
    expect(parseEnv('A="line1\\nline2"\nB=\'no\\nescape\'')).toEqual({ A: "line1\nline2", B: "no\\nescape" });
  });

  it("supports an `export` prefix (real shell-sourceable .env files)", () => {
    expect(parseEnv("export FOO=bar")).toEqual({ FOO: "bar" });
  });
});
