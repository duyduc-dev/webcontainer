import { describe, expect, it } from "vitest";
import { createModuleLoader } from "./moduleLoader";

describe("moduleLoader", () => {
  it("runs the entry module and returns its exports", () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "module.exports = 42;" },
    });

    expect(loader.run("/index.js")).toBe(42);
  });

  it("resolves a \"node:\"-prefixed builtin the same as its bare name", () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "module.exports = require('node:path');" },
    });
    const result = loader.run("/index.js") as { join: unknown };
    expect(typeof result.join).toBe("function");
  });

  it("resolves an absolute-path specifier directly, like a real npm shim requiring its own vendored bin", () => {
    const loader = createModuleLoader({
      sources: {
        "/bin/npm.js": "module.exports = require('/usr/lib/node_modules/npm/bin/npm-cli.js');",
        "/usr/lib/node_modules/npm/bin/npm-cli.js": "module.exports = 'real-npm';",
      },
    });
    expect(loader.run("/bin/npm.js")).toBe("real-npm");
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

  it("throws a clear error for an unresolvable bare (npm) specifier", () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "require('left-pad');" },
    });

    expect(() => loader.run("/index.js")).toThrow(/left-pad/);
  });

  it("resolves a bare specifier via its package.json \"main\" field", () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('left-pad');",
        "/node_modules/left-pad/package.json": '{"main":"lib/pad.js"}',
        "/node_modules/left-pad/lib/pad.js": "module.exports = 'padded';",
      },
    });

    expect(loader.run("/index.js")).toBe("padded");
  });

  it("resolves a bare specifier's subpath directly, bypassing \"main\"", () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('lodash/map');",
        "/node_modules/lodash/package.json": '{"main":"lodash.js"}',
        "/node_modules/lodash/map.js": "module.exports = 'mapped';",
      },
    });

    expect(loader.run("/index.js")).toBe("mapped");
  });

  it("falls back to index.js when a package has no package.json", () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('tiny-pkg');",
        "/node_modules/tiny-pkg/index.js": "module.exports = 'tiny';",
      },
    });

    expect(loader.run("/index.js")).toBe("tiny");
  });

  it("resolves a scoped package", () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('@org/pkg');",
        "/node_modules/@org/pkg/package.json": '{"main":"index.js"}',
        "/node_modules/@org/pkg/index.js": "module.exports = 'scoped';",
      },
    });

    expect(loader.run("/index.js")).toBe("scoped");
  });

  it("prefers a nested node_modules package over a hoisted one at the same specifier", () => {
    const loader = createModuleLoader({
      sources: {
        "/a-dir/index.js": "module.exports = require('dep');",
        "/node_modules/dep/index.js": "module.exports = 'hoisted';",
        "/a-dir/node_modules/dep/index.js": "module.exports = 'nested';",
      },
    });

    expect(loader.run("/a-dir/index.js")).toBe("nested");
  });

  it("a package's own require()s resolve relative to itself, not the requiring script", () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('pkg');",
        "/node_modules/pkg/package.json": '{"main":"index.js"}',
        "/node_modules/pkg/index.js": "module.exports = require('./util');",
        "/node_modules/pkg/util.js": "module.exports = 'from-pkg-util';",
      },
    });

    expect(loader.run("/index.js")).toBe("from-pkg-util");
  });

  it("throws a clear error when a relative module cannot be found", () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "require('./missing');" },
    });

    expect(() => loader.run("/index.js")).toThrow(/missing/);
  });

  it("strips a leading shebang line, like real Node's CommonJS loader (e.g. npm's own bin/npm-cli.js)", () => {
    const loader = createModuleLoader({
      sources: { "/bin/npm-cli.js": "#!/usr/bin/env node\nmodule.exports = 'ran';" },
    });

    expect(loader.run("/bin/npm-cli.js")).toBe("ran");
  });

  it("names the failing module's path when its source has a syntax error", () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "this is not valid javascript(" },
    });

    expect(() => loader.run("/index.js")).toThrow(/\/index\.js/);
  });

  it("falls back to readFileSync for an absolute require the ahead-of-boot preload's string-literal scan couldn't see (a runtime-built specifier, like real npm's own bin/cli.js->lib/cli/entry.js hop)", () => {
    const loader = createModuleLoader({
      sources: {
        "/bin/npm.js": "module.exports = require('/lib/cli/entry.js');",
      },
      readFileSync: (path) => (path === "/lib/cli/entry.js" ? "module.exports = 'from-fallback';" : null),
    });

    expect(loader.run("/bin/npm.js")).toBe("from-fallback");
  });

  it("caches a readFileSync fallback hit so a second require of the same path doesn't call it again", () => {
    let calls = 0;
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('/lib/a.js') + require('/lib/a.js');",
      },
      readFileSync: (path) => {
        if (path !== "/lib/a.js") return null;
        calls++;
        return "module.exports = 1;";
      },
    });

    expect(loader.run("/index.js")).toBe(2);
    expect(calls).toBe(1);
  });

  it("still reports the original specifier when readFileSync also misses", () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "require('./missing');" },
      readFileSync: () => null,
    });

    expect(() => loader.run("/index.js")).toThrow(/missing/);
  });

  it("resolves a dynamic import() of a plain CJS module, wrapped as a namespace object", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = import('./dep.js');",
        "/dep.js": "module.exports = { a: 1, b: 2 };",
      },
    });

    await expect(loader.run("/index.js")).resolves.toEqual({ a: 1, b: 2, default: { a: 1, b: 2 } });
  });

  it("resolves a dynamic import() of a genuinely ESM-shaped module (retried through the ESM->CJS transform)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = import('chalk');",
        "/node_modules/chalk/package.json": '{"main":"index.js"}',
        "/node_modules/chalk/index.js": "export class Chalk {}\nconst chalk = new Chalk();\nexport default chalk;",
      },
    });

    const ns = (await loader.run("/index.js")) as { Chalk: new () => unknown; default: unknown };
    expect(typeof ns.Chalk).toBe("function");
    expect(ns.default).toBeInstanceOf(ns.Chalk);
  });

  it("doesn't rewrite a .import(...) property access as a dynamic import", () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "module.exports = { import: (x) => x * 2 }.import(21);" },
    });

    expect(loader.run("/index.js")).toBe(42);
  });

  it("resolves a package's own '#specifier' via its package.json \"imports\" map (real chalk@5's own pattern)", () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('pkg');",
        "/node_modules/pkg/package.json": JSON.stringify({
          main: "index.js",
          imports: {
            "#dep": { node: "./node-dep.js", default: "./browser-dep.js" },
            "#plain": "./plain-dep.js",
          },
        }),
        "/node_modules/pkg/index.js": "module.exports = require('#dep') + '/' + require('#plain');",
        "/node_modules/pkg/node-dep.js": "module.exports = 'node-dep';",
        "/node_modules/pkg/browser-dep.js": "module.exports = 'browser-dep';",
        "/node_modules/pkg/plain-dep.js": "module.exports = 'plain-dep';",
      },
    });

    expect(loader.run("/index.js")).toBe("node-dep/plain-dep");
  });

  it("throws a clear error for an unresolvable '#specifier'", () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "require('#missing');",
        "/package.json": '{"imports":{}}',
      },
    });

    expect(() => loader.run("/index.js")).toThrow(/#missing/);
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
