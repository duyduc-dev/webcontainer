import { describe, expect, it } from "vitest";
import { createModuleLoader } from "./moduleLoader";

describe("moduleLoader", () => {
  it("runs the entry module and returns its exports", () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "module.exports = 42;" },
    });

    expect(loader.run("/index.js")).toBe(42);
  });

  it("resolves a relative require and caches the module (single execution)", () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('./a') + require('./a');",
        "/a.js": "globalThis.__loadCount = (globalThis.__loadCount ?? 0) + 1; module.exports = 1;",
      },
    });

    const result = loader.run("/index.js");

    expect(result).toBe(2);
    expect((globalThis as any).__loadCount).toBe(1);
    delete (globalThis as any).__loadCount;
  });

  it("resolves a directory-style require to its index.js", () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('./lib');",
        "/lib/index.js": "module.exports = 'lib-index';",
      },
    });

    expect(loader.run("/index.js")).toBe("lib-index");
  });

  it("parses a required .json file", () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('./data.json');",
        "/data.json": '{"a":1}',
      },
    });

    expect(loader.run("/index.js")).toEqual({ a: 1 });
  });

  it("gives builtins precedence over any same-named local module", () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('path');",
        // a coincidentally-named local file that must NOT shadow the builtin,
        // since bare specifiers are never resolved against `sources`.
        "/path.js": "module.exports = 'not-the-builtin';",
      },
    });

    const result = loader.run("/index.js") as { join: unknown };
    expect(typeof result.join).toBe("function");
  });

  it("resolves a per-instance builtin override (e.g. a process-specific fs)", () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "module.exports = require('fs').marker;" },
      builtins: { fs: { marker: "injected" } },
    });

    expect(loader.run("/index.js")).toBe("injected");
  });

  it("throws a clear error for an unsupported bare (npm) specifier", () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "require('left-pad');" },
    });

    expect(() => loader.run("/index.js")).toThrow(/left-pad/);
  });

  it("throws a clear error when a relative module cannot be found", () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "require('./missing');" },
    });

    expect(() => loader.run("/index.js")).toThrow(/missing/);
  });

  it("supports circular requires by returning the in-progress exports object", () => {
    const loader = createModuleLoader({
      sources: {
        "/a.js": "exports.fromA = true; exports.b = require('./b');",
        "/b.js": "const a = require('./a'); exports.sawFromA = a.fromA;",
      },
    });

    const result = loader.run("/a.js") as { fromA: boolean; b: { sawFromA: boolean } };
    expect(result.fromA).toBe(true);
    // b required a while a was still mid-execution, so a.fromA was already set
    // (assigned before the require('./b') call) but a.b was not yet.
    expect(result.b.sawFromA).toBe(true);
  });
});
