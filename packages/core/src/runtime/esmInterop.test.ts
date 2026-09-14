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

describe("transformEsmToCjs import.meta handling", () => {
  it("compiles a module that mentions import.meta", () => {
    const source = [
      "import { YError } from '../yerror.js';",
      "export function applyExtends(config) {",
      "  return import.meta.resolve(config.extends);",
      "}",
    ].join("\n");

    const compiled = transformEsmToCjs(source);
    expect(() => new Function("module", "exports", "require", "__filename", "__dirname", compiled)).not.toThrow();
  });

  it("resolves url/filename/dirname from the CommonJS bindings", () => {
    const compiled = transformEsmToCjs("export const here = import.meta.dirname;\nexport const self = import.meta.url;");
    const exported: Record<string, unknown> = {};
    const requireStub = (specifier: string) =>
      specifier === "url" ? { pathToFileURL: (path: string) => new URL(`file://${path}`) } : {};

    new Function("module", "exports", "require", "__filename", "__dirname", compiled)(
      { exports: exported },
      exported,
      requireStub,
      "/pkg/lib/thing.js",
      "/pkg/lib",
    );

    expect(exported.here).toBe("/pkg/lib");
    expect(exported.self).toBe("file:///pkg/lib/thing.js");
  });

  it("leaves the text 'import.meta' inside a string literal alone", () => {
    const compiled = transformEsmToCjs('export const advice = "use import.meta.url instead";');
    expect(compiled).toContain('"use import.meta.url instead"');
    expect(compiled).not.toContain("__dwcImportMeta = {");
  });
});

describe("transformEsmToCjs wrapper-binding collisions", () => {
  it("lets a module declare its own require via createRequire", () => {
    const source = [
      "import { createRequire } from 'node:module';",
      "const require = createRequire(import.meta.url);",
      "export const pkg = 'ok';",
    ].join("\n");

    const compiled = transformEsmToCjs(source);
    expect(() =>
      new Function("module", "exports", "require", "__filename", "__dirname", compiled),
    ).not.toThrow();
  });

  it("still exports everything the body declared inside the added scope", () => {
    const compiled = transformEsmToCjs("const require = () => 1;\nexport const value = 42;");
    const exported: Record<string, unknown> = {};

    new Function("module", "exports", "require", "__filename", "__dirname", compiled)(
      { exports: exported },
      exported,
      () => ({}),
      "/pkg/index.js",
      "/pkg",
    );

    expect(exported.value).toBe(42);
  });

  it("does not add a scope for a module that declares nothing conflicting", () => {
    expect(transformEsmToCjs("export const value = 1;")).not.toContain("{\n");
  });
});

describe("transformEsmToCjs multi-line default exports", () => {
  it("handles an export default whose expression spans many lines", () => {
    const source = ["export default {", "  a: 1,", "  b: 2,", "};"].join("\n");
    const exported: Record<string, unknown> = {};

    new Function("module", "exports", "require", transformEsmToCjs(source))({ exports: exported }, exported, () => ({}));

    expect(exported.default).toEqual({ a: 1, b: 2 });
  });

  it("handles export default class and keeps the rest of the file intact", () => {
    const source = ["export default class Thing {", "  value() { return 7; }", "}", "export const extra = 1;"].join("\n");
    const exported: Record<string, unknown> = {};

    new Function("module", "exports", "require", transformEsmToCjs(source))({ exports: exported }, exported, () => ({}));

    const Thing = exported.default as new () => { value(): number };
    expect(new Thing().value()).toBe(7);
    expect(exported.extra).toBe(1);
  });
});

describe("transformEsmToCjs combined default+named imports", () => {
  it("handles import Default, { named } from 'specifier'", () => {
    const source = "import Dep, { helper } from './dep.js';\nexport const out = [Dep, helper];";
    const exported: Record<string, unknown> = {};
    const fakeRequire = () => ({ __esModule: true, default: "the-default", helper: "the-helper" });

    new Function("module", "exports", "require", "__dwcInteropDefault", transformEsmToCjs(source))(
      { exports: exported },
      exported,
      fakeRequire,
      interopDefault,
    );

    expect(exported.out).toEqual(["the-default", "the-helper"]);
  });

  it("handles import Default, * as ns from 'specifier'", () => {
    const source = "import Dep, * as ns from './dep.js';\nexport const out = [Dep, ns.helper];";
    const exported: Record<string, unknown> = {};
    const fakeRequire = () => ({ __esModule: true, default: "the-default", helper: "the-helper" });

    new Function("module", "exports", "require", "__dwcInteropDefault", transformEsmToCjs(source))(
      { exports: exported },
      exported,
      fakeRequire,
      interopDefault,
    );

    expect(exported.out).toEqual(["the-default", "the-helper"]);
  });
});
