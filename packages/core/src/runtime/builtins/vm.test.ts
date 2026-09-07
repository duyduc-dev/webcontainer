import { describe, expect, it } from "vitest";
import { runInThisContext } from "./vm";

describe("vm.runInThisContext", () => {
  it("compiles and returns a function expression, callable with .apply() like real Node's vm.runInThisContext", () => {
    // Real npm's own promzard dependency (used by `npm init`/`npm create`)
    // does exactly this: wrap a script's source in a function expression
    // whose parameters are the context keys, compile it via
    // runInThisContext, then .apply() it with the context values.
    const fn = runInThisContext("(function (a, b) { return a + b; })") as (a: number, b: number) => number;
    expect(typeof fn).toBe("function");
    expect(fn.apply(null, [1, 2])).toBe(3);
  });

  it("shares the real global scope with the caller (not an isolated sandbox - that's the whole point of runInThisContext vs. runInNewContext)", () => {
    (globalThis as Record<string, unknown>).__vmTestGlobal = "real-global-value";
    try {
      const fn = runInThisContext("(function () { return globalThis.__vmTestGlobal; })") as () => string;
      expect(fn()).toBe("real-global-value");
    } finally {
      delete (globalThis as Record<string, unknown>).__vmTestGlobal;
    }
  });

  it("accepts a filename as a plain string second argument (real Node's legacy call shape)", () => {
    const fn = runInThisContext("(function () { return 1; })", "/some/file.js") as () => number;
    expect(fn()).toBe(1);
  });

  it("accepts a filename via an options object (real Node's newer call shape)", () => {
    const fn = runInThisContext("(function () { return 2; })", { filename: "/some/file.js" }) as () => number;
    expect(fn()).toBe(2);
  });

  it("does not throw when the code contains a trailing newline plus the appended sourceURL comment", () => {
    // Guards the exact shape promzard produces: `(function(...) { <script
    // body, which may itself end in anything, including a line comment>
    // })` - the appended `//# sourceURL=...` must land on its own line, not
    // get glued onto - or commented into - the tail of the compiled code.
    const fn = runInThisContext("(function () {\n  return 3; // trailing comment\n})", "/f.js") as () => number;
    expect(fn()).toBe(3);
  });
});
