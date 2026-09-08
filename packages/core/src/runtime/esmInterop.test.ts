import { describe, expect, it } from "vitest";
import { interopDefault, toNamespace, transformEsmToCjs } from "./esmInterop";

describe("toNamespace", () => {
  it("spreads a plain CJS export as named exports plus default", () => {
    expect(toNamespace({ a: 1, b: 2 })).toEqual({ a: 1, b: 2, default: { a: 1, b: 2 } });
  });

  it("wraps a non-object CJS export (e.g. a function) as just default", () => {
    const fn = () => {};
    expect(toNamespace(fn)).toEqual({ default: fn });
  });

  it("passes an already __esModule-shaped export through unchanged", () => {
    const ns = { __esModule: true, default: "d", named: "n" };
    expect(toNamespace(ns)).toBe(ns);
  });
});

describe("interopDefault", () => {
  it("unwraps .default from an __esModule-marked value", () => {
    expect(interopDefault({ __esModule: true, default: 42 })).toBe(42);
  });

  it("returns a plain CJS export untouched", () => {
    const fn = () => {};
    expect(interopDefault(fn)).toBe(fn);
    expect(interopDefault({ a: 1 })).toEqual({ a: 1 });
  });
});

describe("transformEsmToCjs", () => {
  const run = (source: string): Record<string, unknown> => {
    const transformed = transformEsmToCjs(source);
    const wrapper = new Function("module", "exports", "require", "__dwcInteropDefault", transformed);
    const moduleObj = { exports: {} };
    const fakeRequire = (specifier: string): unknown => {
      if (specifier === "./dep.js") return { a: 1, b: 2, modifierNames: 1, colorNames: 2 };
      if (specifier === "./esm-dep.js") return { __esModule: true, default: "esm-default" };
      if (specifier === "./reexport-dep.js") return { __esModule: true, default: "should-not-reexport", named: "should-reexport" };
      throw new Error(`unexpected require('${specifier}')`);
    };
    wrapper(moduleObj, moduleObj.exports, fakeRequire, interopDefault);
    return moduleObj.exports as Record<string, unknown>;
  };

  it("marks the output as __esModule", () => {
    expect(run("export const x = 1;").__esModule).toBe(true);
  });

  it("handles export default of an identifier", () => {
    const exports = run("const chalk = 'the-chalk-value';\nexport default chalk;");
    expect(exports.default).toBe("the-chalk-value");
  });

  it("handles export const/let/var while keeping the local binding usable", () => {
    const exports = run("export const x = 1;\nconst y = x + 1;\nexport default y;");
    expect(exports.x).toBe(1);
    expect(exports.default).toBe(2);
  });

  it("handles export function, hoisted so it can be called from earlier in the file", () => {
    const exports = run("const early = later();\nexport function later() { return 'ok'; }\nexport default early;");
    expect(typeof exports.later).toBe("function");
    expect((exports.later as () => string)()).toBe("ok");
    expect(exports.default).toBe("ok");
  });

  it("handles export class", () => {
    const exports = run("export class Chalk { constructor() { this.tag = 'chalk'; } }");
    const Chalk = exports.Chalk as new () => { tag: string };
    expect(new Chalk().tag).toBe("chalk");
  });

  it("handles a local export list with aliasing, no 'from'", () => {
    const exports = run("const stdoutColor = 1;\nconst stderrColor = 2;\nexport { stdoutColor as supportsColor, stderrColor };");
    expect(exports.supportsColor).toBe(1);
    expect(exports.stderrColor).toBe(2);
  });

  it("does not rewrite import/export-looking text sitting inside a string literal (real @emnapi/core's own shape: an error message advising real import syntax as plain text)", () => {
    const source =
      'function warn() { throw new TypeError("Invalid `options.context`. Use `import { getDefaultContext } from \'@emnapi/runtime\'`"); }\nexport const x = 1;';
    const exports = run(source);
    expect(exports.x).toBe(1);
  });

  it("handles \"export * from 'specifier'\" (real @emnapi/core's own shape, a rolldown-vite dependency), re-exporting every named export but not 'default'", () => {
    const exports = run("export * from './reexport-dep.js';");
    expect(exports.named).toBe("should-reexport");
    expect(exports.default).toBeUndefined();
  });

  it("handles a multi-line export list with a comment and 'from' (chalk's own real shape)", () => {
    const source = [
      "export {",
      "\tmodifierNames,",
      "\tcolorNames,",
      "",
      "\t// TODO: Remove these aliases in the next major version",
      "\tmodifierNames as modifiers,",
      "} from './dep.js';",
    ].join("\n");
    const exports = run(source);
    expect(exports.modifierNames).toBe(1); // './dep.js' -> { a: 1, b: 2 } - see fakeRequire below
  });

  it("handles import Default with CJS/ESM interop", () => {
    const cjsExports = run("import dep from './dep.js';\nexport default dep;");
    expect(cjsExports.default).toEqual({ a: 1, b: 2, modifierNames: 1, colorNames: 2 });

    const esmExports = run("import dep from './esm-dep.js';\nexport default dep;");
    expect(esmExports.default).toBe("esm-default");
  });

  it("handles import { a, b as c } from 'specifier', including multi-line", () => {
    const exports = run(["import {", "\ta,", "\tb as c,", "} from './dep.js';", "export { a, c };"].join("\n"));
    expect(exports.a).toBe(1);
    expect(exports.c).toBe(2);
  });

  it("handles import * as ns from 'specifier'", () => {
    const exports = run("import * as ns from './dep.js';\nexport default ns;");
    expect(exports.default).toEqual({ a: 1, b: 2, modifierNames: 1, colorNames: 2 });
  });

  it("handles a bare side-effect-only import", () => {
    // Should not throw despite './dep.js' being required for its side effect only.
    expect(() => run("import './dep.js';\nexport const done = true;")).not.toThrow();
  });

  it("is a no-op-ish pass over plain garbage - callers fall back to the original error", () => {
    // The transform itself must not throw on non-ESM input; moduleLoader.ts
    // is what decides to report the ORIGINAL SyntaxError when the retried
    // compile still fails.
    expect(() => transformEsmToCjs("this is not valid javascript(")).not.toThrow();
  });
});
