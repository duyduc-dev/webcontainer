import { describe, expect, it } from "vitest";
import { createModuleLoader } from "./moduleLoader";

describe("moduleLoader", () => {
  it("runs the entry module and returns its exports", async () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "module.exports = 42;" },
    });

    expect(await loader.run("/index.js")).toBe(42);
  });

  it("resolves a \"node:\"-prefixed builtin the same as its bare name", async () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "module.exports = require('node:path');" },
    });
    const result = (await loader.run("/index.js")) as { join: unknown };
    expect(typeof result.join).toBe("function");
  });

  it("require.resolve() returns the resolved path without loading the module", async () => {
    let loaded = false;
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require.resolve('./dep.js');",
        "/dep.js": "globalThis.__markLoaded && globalThis.__markLoaded(); module.exports = 1;",
      },
    });
    (globalThis as any).__markLoaded = () => {
      loaded = true;
    };
    try {
      expect(await loader.run("/index.js")).toBe("/dep.js");
      expect(loaded).toBe(false);
    } finally {
      delete (globalThis as any).__markLoaded;
    }
  });

  it("require.resolve() resolves a bare specifier via node_modules, same as require()", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require.resolve('left-pad');",
        "/node_modules/left-pad/package.json": '{"main":"index.js"}',
        "/node_modules/left-pad/index.js": "module.exports = 'padded';",
      },
    });

    expect(await loader.run("/index.js")).toBe("/node_modules/left-pad/index.js");
  });

  it("require.resolve() returns a builtin's own specifier, not a path", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = [require.resolve('path'), require.resolve('node:os')];",
      },
    });

    expect(await loader.run("/index.js")).toEqual(["path", "node:os"]);
  });

  it("require.resolve() throws the same \"Cannot find module\" error require() would", async () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "require.resolve('left-pad');" },
    });

    await expect(loader.run("/index.js")).rejects.toThrow(/left-pad/);
  });

  it("resolves an absolute-path specifier directly, like a real npm shim requiring its own vendored bin", async () => {
    const loader = createModuleLoader({
      sources: {
        "/bin/npm.js": "module.exports = require('/usr/lib/node_modules/npm/bin/npm-cli.js');",
        "/usr/lib/node_modules/npm/bin/npm-cli.js": "module.exports = 'real-npm';",
      },
    });
    expect(await loader.run("/bin/npm.js")).toBe("real-npm");
  });

  it("resolves a relative require and caches the module (single execution)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('./a') + require('./a');",
        "/a.js": "globalThis.__loadCount = (globalThis.__loadCount ?? 0) + 1; module.exports = 1;",
      },
    });

    const result = await loader.run("/index.js");

    expect(result).toBe(2);
    expect((globalThis as any).__loadCount).toBe(1);
    delete (globalThis as any).__loadCount;
  });

  it("resolves a directory-style require to its index.js", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('./lib');",
        "/lib/index.js": "module.exports = 'lib-index';",
      },
    });

    expect(await loader.run("/index.js")).toBe("lib-index");
  });

  it("parses a required .json file", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('./data.json');",
        "/data.json": '{"a":1}',
      },
    });

    expect(await loader.run("/index.js")).toEqual({ a: 1 });
  });

  it("gives builtins precedence over any same-named local module", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('path');",
        // a coincidentally-named local file that must NOT shadow the builtin,
        // since bare specifiers are never resolved against `sources`.
        "/path.js": "module.exports = 'not-the-builtin';",
      },
    });

    const result = (await loader.run("/index.js")) as { join: unknown };
    expect(typeof result.join).toBe("function");
  });

  it("resolves a per-instance builtin override (e.g. a process-specific fs)", async () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "module.exports = require('fs').marker;" },
      builtins: { fs: { marker: "injected" } },
    });

    expect(await loader.run("/index.js")).toBe("injected");
  });

  it("throws a clear error for an unresolvable bare (npm) specifier", async () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "require('left-pad');" },
    });

    await expect(loader.run("/index.js")).rejects.toThrow(/left-pad/);
  });

  it("resolves a bare specifier via its package.json \"main\" field", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('left-pad');",
        "/node_modules/left-pad/package.json": '{"main":"lib/pad.js"}',
        "/node_modules/left-pad/lib/pad.js": "module.exports = 'padded';",
      },
    });

    expect(await loader.run("/index.js")).toBe("padded");
  });

  it("resolves a bare specifier with no \"main\" field via its package.json \"exports\" map, preferring \"require\" over \"import\" (real @napi-rs/wasm-runtime's own shape - a rolldown-vite dependency reached via its WebContainer WASM fallback)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('dual-pkg');",
        "/node_modules/dual-pkg/package.json": '{"exports":{".":{"import":"./esm.mjs","require":"./cjs.js"}}}',
        "/node_modules/dual-pkg/cjs.js": "module.exports = 'cjs-build';",
        "/node_modules/dual-pkg/esm.mjs": "export default 'wrong-build';",
      },
    });

    expect(await loader.run("/index.js")).toBe("cjs-build");
  });

  it("resolves a bare specifier's subpath through an \"exports\" subpath map", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('dual-pkg/fs');",
        "/node_modules/dual-pkg/package.json": '{"exports":{".":{"require":"./cjs.js"},"./fs":{"require":"./fs.js"}}}',
        "/node_modules/dual-pkg/fs.js": "module.exports = 'fs-subpath';",
      },
    });

    expect(await loader.run("/index.js")).toBe("fs-subpath");
  });

  it("does not fall back to a package's own \"main\" field or plain file guessing once \"exports\" is present (real Node: \"exports\" replaces legacy resolution entirely, not just adds to it)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('exports-only-pkg');",
        "/node_modules/exports-only-pkg/package.json": '{"main":"legacy.js","exports":{".":{"browser":"./browser.js"}}}',
        "/node_modules/exports-only-pkg/legacy.js": "module.exports = 'legacy';",
      },
    });

    await expect(loader.run("/index.js")).rejects.toThrow(/Cannot find module/);
  });

  it("resolves a bare specifier's subpath directly, bypassing \"main\"", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('lodash/map');",
        "/node_modules/lodash/package.json": '{"main":"lodash.js"}',
        "/node_modules/lodash/map.js": "module.exports = 'mapped';",
      },
    });

    expect(await loader.run("/index.js")).toBe("mapped");
  });

  it("falls back to index.js when a package has no package.json", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('tiny-pkg');",
        "/node_modules/tiny-pkg/index.js": "module.exports = 'tiny';",
      },
    });

    expect(await loader.run("/index.js")).toBe("tiny");
  });

  it("resolves a scoped package", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('@org/pkg');",
        "/node_modules/@org/pkg/package.json": '{"main":"index.js"}',
        "/node_modules/@org/pkg/index.js": "module.exports = 'scoped';",
      },
    });

    expect(await loader.run("/index.js")).toBe("scoped");
  });

  it("prefers a nested node_modules package over a hoisted one at the same specifier", async () => {
    const loader = createModuleLoader({
      sources: {
        "/a-dir/index.js": "module.exports = require('dep');",
        "/node_modules/dep/index.js": "module.exports = 'hoisted';",
        "/a-dir/node_modules/dep/index.js": "module.exports = 'nested';",
      },
    });

    expect(await loader.run("/a-dir/index.js")).toBe("nested");
  });

  it("a package's own require()s resolve relative to itself, not the requiring script", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "module.exports = require('pkg');",
        "/node_modules/pkg/package.json": '{"main":"index.js"}',
        "/node_modules/pkg/index.js": "module.exports = require('./util');",
        "/node_modules/pkg/util.js": "module.exports = 'from-pkg-util';",
      },
    });

    expect(await loader.run("/index.js")).toBe("from-pkg-util");
  });

  it("throws a clear error when a relative module cannot be found", async () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "require('./missing');" },
    });

    await expect(loader.run("/index.js")).rejects.toThrow(/missing/);
  });

  it("strips a leading shebang line, like real Node's CommonJS loader (e.g. npm's own bin/npm-cli.js)", async () => {
    const loader = createModuleLoader({
      sources: { "/bin/npm-cli.js": "#!/usr/bin/env node\nmodule.exports = 'ran';" },
    });

    expect(await loader.run("/bin/npm-cli.js")).toBe("ran");
  });

  it("names the failing module's path when its source has a syntax error", async () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "this is not valid javascript(" },
    });

    await expect(loader.run("/index.js")).rejects.toThrow(/\/index\.js/);
  });

  it("falls back to readFileSync for an absolute require the ahead-of-boot preload's string-literal scan couldn't see (a runtime-built specifier, like real npm's own bin/cli.js->lib/cli/entry.js hop)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/bin/npm.js": "module.exports = require('/lib/cli/entry.js');",
      },
      readFileSync: (path) => (path === "/lib/cli/entry.js" ? "module.exports = 'from-fallback';" : null),
    });

    expect(await loader.run("/bin/npm.js")).toBe("from-fallback");
  });

  it("caches a readFileSync fallback hit so a second require of the same path doesn't call it again", async () => {
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

    expect(await loader.run("/index.js")).toBe(2);
    expect(calls).toBe(1);
  });

  it("still reports the original specifier when readFileSync also misses", async () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "require('./missing');" },
      readFileSync: () => null,
    });

    await expect(loader.run("/index.js")).rejects.toThrow(/missing/);
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

  it("doesn't rewrite a .import(...) property access as a dynamic import", async () => {
    const loader = createModuleLoader({
      sources: { "/index.js": "module.exports = { import: (x) => x * 2 }.import(21);" },
    });

    expect(await loader.run("/index.js")).toBe(42);
  });

  it("resolves a package's own '#specifier' via its package.json \"imports\" map (real chalk@5's own pattern)", async () => {
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

    expect(await loader.run("/index.js")).toBe("node-dep/plain-dep");
  });

  it("throws a clear error for an unresolvable '#specifier'", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "require('#missing');",
        "/package.json": '{"imports":{}}',
      },
    });

    await expect(loader.run("/index.js")).rejects.toThrow(/#missing/);
  });

  it("tags a runtime error (not just a syntax error) with the module path that actually threw it", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "require('./deep.js');",
        "/deep.js": "undefined.boom;",
      },
    });

    await expect(loader.run("/index.js")).rejects.toThrow(/\/deep\.js/);
  });

  it("tags the ORIGINATING module only, not every intermediate require() on the way out", async () => {
    const loader = createModuleLoader({
      sources: {
        "/index.js": "require('./middle.js');",
        "/middle.js": "require('./deep.js');",
        "/deep.js": "undefined.boom;",
      },
    });

    try {
      await loader.run("/index.js");
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("/deep.js");
      expect(message).not.toContain("/middle.js");
      expect(message).not.toContain("/index.js");
    }
  });

  it("supports circular requires by returning the in-progress exports object", async () => {
    const loader = createModuleLoader({
      sources: {
        "/a.js": "exports.fromA = true; exports.b = require('./b');",
        "/b.js": "const a = require('./a'); exports.sawFromA = a.fromA;",
      },
    });

    const result = (await loader.run("/a.js")) as { fromA: boolean; b: { sawFromA: boolean } };
    expect(result.fromA).toBe(true);
    // b required a while a was still mid-execution, so a.fromA was already set
    // (assigned before the require('./b') call) but a.b was not yet.
    expect(result.b.sawFromA).toBe(true);
  });

  it("a circular require sees a full `module.exports = X` reassignment, not just mutations of the original exports object (real npm's own pacote hits exactly this: fetcher.js reassigns module.exports to its base class, THEN require()s a subclass file that requires fetcher.js back)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/base.js": [
          "class Base {}",
          "module.exports = Base;",
          // Circular: child.js requires base.js again, mid-execution, AFTER
          // the reassignment above - it must see the real class, not the
          // module system's own initial `{}` placeholder.
          "const Base2 = require('./child.js').Base2;",
          "module.exports.Base2 = Base2;",
        ].join("\n"),
        "/child.js": [
          "const Base = require('./base.js');",
          "class Base2 extends Base {}", // throws if Base came back as `{}`
          "module.exports = { Base2 };",
        ].join("\n"),
      },
    });

    const result = (await loader.run("/base.js")) as { new (): unknown; Base2: new () => unknown };
    expect(typeof result).toBe("function");
    expect(new result.Base2()).toBeInstanceOf(result);
  });
});

describe("moduleLoader ESM support", () => {
  it("evaluates a genuinely ESM entry (package.json \"type\": \"module\") via real native import(), with live bindings across a static import", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": "import { bump, getCount } from './counter.js';\nbump();\nbump();\nexport const result = getCount();",
        "/counter.js": "let count = 0;\nexport function bump() { count++; }\nexport function getCount() { return count; }",
      },
    });

    const ns = (await loader.run("/index.js")) as { result: number };
    expect(ns.result).toBe(2);
  });

  it("detects ESM via a .mjs extension even with no package.json at all", async () => {
    const loader = createModuleLoader({
      sources: { "/index.mjs": "export const value = 'from-mjs';" },
    });

    const ns = (await loader.run("/index.mjs")) as { value: string };
    expect(ns.value).toBe("from-mjs");
  });

  it("an ESM module importing a bare CJS dependency (via package.json \"main\", no \"exports\" field) sees its real, already-evaluated exports - not statically guessed", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": "import leftPad, { helper } from 'left-pad';\nexport const padded = leftPad('5', 3, '0');\nexport const helped = helper();",
        "/node_modules/left-pad/package.json": '{"main":"index.js"}',
        "/node_modules/left-pad/index.js": [
          "function leftPad(str, len, ch) { str = String(str); while (str.length < len) str = ch + str; return str; }",
          "function helper() { return 'helped'; }",
          "module.exports = leftPad;",
          "module.exports.helper = helper;",
        ].join("\n"),
      },
    });

    const ns = (await loader.run("/index.js")) as { padded: string; helped: string };
    expect(ns.padded).toBe("005");
    expect(ns.helped).toBe("helped");
  });

  it("resolves a package's package.json \"exports\" map for a bare ESM import (real rollup/vite shape: a conditions object per subpath, \"import\" preferred over \"default\")", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": "export { value } from 'pkg';",
        "/node_modules/pkg/package.json": JSON.stringify({
          // Real Node determines a .js file's module kind from the nearest
          // package.json's "type" field alone, regardless of what the
          // "exports" map's conditions point at - a package with no "type":
          // "module" of its own is CJS even if one of its "exports"
          // conditions happens to point at ESM-shaped syntax. This matters
          // for the test: the "import" condition ("./esm.js") only actually
          // gets evaluated as real ESM because this package opts in here.
          type: "module",
          exports: { ".": { import: "./esm.js", default: "./cjs.js" } },
        }),
        "/node_modules/pkg/esm.js": "export const value = 'from-esm-build';",
        "/node_modules/pkg/cjs.js": "module.exports = { value: 'from-cjs-build' };",
      },
    });

    const ns = (await loader.run("/index.js")) as { value: string };
    expect(ns.value).toBe("from-esm-build");
  });

  it("resolves a wildcard \"exports\" subpath (real rollup's own \"./dist/*\": \"./dist/*\" shape)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": "export { value } from 'pkg/dist/thing.js';",
        "/node_modules/pkg/package.json": JSON.stringify({ exports: { "./dist/*": "./dist/*" } }),
        "/node_modules/pkg/dist/thing.js": "export const value = 'matched-wildcard';",
      },
    });

    const ns = (await loader.run("/index.js")) as { value: string };
    expect(ns.value).toBe("matched-wildcard");
  });

  it("an \"exports\" value of null explicitly blocks a subpath rather than falling back to \"main\"", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": "import 'pkg/internal.js';",
        "/node_modules/pkg/package.json": JSON.stringify({
          main: "index.js",
          exports: { ".": "./index.js", "./internal.js": null },
        }),
        "/node_modules/pkg/index.js": "export const value = 1;",
        "/node_modules/pkg/internal.js": "export const value = 'should not be reachable';",
      },
    });

    await expect(loader.run("/index.js")).rejects.toThrow();
  });

  it("rewrites import.meta.url to a real file://-shaped path, and import.meta.main as an entry-identity check (not a path compare)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/entry.js": "import { isDepMain } from './dep.js';\nexport const url = import.meta.url;\nexport const isMain = import.meta.main;\nexport const depIsMain = isDepMain;",
        "/dep.js": "export const isDepMain = import.meta.main;",
      },
    });

    const ns = (await loader.run("/entry.js")) as { url: string; isMain: boolean; depIsMain: boolean };
    expect(ns.url).toBe("file:///entry.js");
    expect(ns.isMain).toBe(true);
    expect(ns.depIsMain).toBe(false);
  });

  it("resolves a dynamic import() with a literal specifier the same way a static import would (also exercises top-level await)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": "export const dep = await import('./dep.js');",
        "/dep.js": "export const value = 42;",
      },
    });

    const ns = (await loader.run("/index.js")) as { dep: { value: number } };
    expect(ns.dep.value).toBe(42);
  });

  it("resolves a dynamic import() whose specifier is a COMPUTED expression, not a bare string literal (real Vite's own native config loader does `import(someUrl + '?t=' + Date.now())`)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": "const base = './dep'; export const dep = await import(base + '.js');",
        "/dep.js": "export const value = 7;",
      },
    });

    const ns = (await loader.run("/index.js")) as { dep: { value: number } };
    expect(ns.dep.value).toBe(7);
  });

  it("resolves a computed dynamic import() of a `file://` URL with a cache-busting query string - the exact shape real Vite's native config loader uses (`import(pathToFileURL(path).href + '?t=' + Date.now())`)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": "export const cfg = await import('file:///config.js' + '?t=' + 12345);",
        "/config.js": "export default { value: 'loaded' };",
      },
    });

    const ns = (await loader.run("/index.js")) as { cfg: { default: { value: string } } };
    expect(ns.cfg.default.value).toBe("loaded");
  });

  it("doesn't rewrite a `.import(...)` method CALL as a dynamic import, in an ESM entry (real Vite's own `module-runner.js` calls `this.import(acceptedPath)` on its ModuleRunner class - the computed-specifier fallback rewrite broke on exactly this before the `(?<!\\.)` guard existed)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": ["const obj = { import: (x) => x * 2 };", "export const value = obj.import(21);"].join("\n"),
      },
    });

    const ns = (await loader.run("/index.js")) as { value: number };
    expect(ns.value).toBe(42);
  });

  it("doesn't rewrite an `import(id) { ... }` method DECLARATION as a dynamic import, in an ESM entry (real Vite's own ModuleRunner class declares exactly `async import(id) { ... }` - no preceding `.` for the negative lookbehind to catch, since it's a declaration not a call; guarded instead by checking whether the closing paren is followed by a block)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": ["class Runner {", "  import(x) { return x * 2; }", "}", "export const value = new Runner().import(21);"].join(
          "\n",
        ),
      },
    });

    const ns = (await loader.run("/index.js")) as { value: number };
    expect(ns.value).toBe(42);
  });

  it("a computed dynamic import() specifier that's a genuinely unresolvable path rejects with a real error, not a bogus resolution", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": "const base = './missing'; export const lazy = () => import(base + '.js');",
      },
    });

    const ns = (await loader.run("/index.js")) as { lazy: () => Promise<unknown> };
    await expect(ns.lazy()).rejects.toThrow(/Cannot find module/);
  });

  it("a dynamic import() of a missing/optional module doesn't crash module evaluation - resolution is deferred until the call actually runs, and only awaiting it rejects (real Vite's own optional-peer-dep pattern, e.g. `esbuild ||= import('esbuild')`, must not turn a textually-present but never-called import() into a fatal load-time error)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": [
          "let pending;",
          "const lazyImportOptionalDep = () => (pending ||= import('optional-missing-dep'));",
          "export const evaluatedWithoutThrowing = true;",
          "export const lazy = lazyImportOptionalDep;",
        ].join("\n"),
      },
    });

    const ns = (await loader.run("/index.js")) as { evaluatedWithoutThrowing: boolean; lazy: () => Promise<unknown> };
    expect(ns.evaluatedWithoutThrowing).toBe(true);
    await expect(ns.lazy()).rejects.toThrow(/Cannot find module/);
  });

  it("real Vite's own `createRequire(import.meta.url)` pattern: an ESM entry can build a require() scoped to itself and use it to load a relative CJS module", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": [
          "import { createRequire } from 'module';",
          "const require = createRequire(import.meta.url);",
          "export const dep = require('./dep.js');",
        ].join("\n"),
        "/dep.js": "module.exports = { value: 99 };",
      },
    });

    const ns = (await loader.run("/index.js")) as { dep: { value: number } };
    expect(ns.dep.value).toBe(99);
  });

  it("a real-world-traced case: statically importing a genuinely ESM-only package (chalk@5's actual shape - a class instance as the default export)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": "import chalk, { Chalk } from 'chalk';\nexport const isInstance = chalk instanceof Chalk;",
        "/node_modules/chalk/package.json": '{"type":"module","main":"index.js"}',
        "/node_modules/chalk/index.js": "export class Chalk {}\nconst chalk = new Chalk();\nexport default chalk;",
      },
    });

    const ns = (await loader.run("/index.js")) as { isInstance: boolean };
    expect(ns.isInstance).toBe(true);
  });

  it("a specifier sitting inside a string/comment/regex literal near a real import is never mistaken for one (masking correctness)", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/index.js": [
          "// import fake from 'not-a-real-import';",
          "const notReal = \"import fake2 from 'also-not-real';\";",
          "const template = `some text ${1 / 2} more from '${'x'}' text`;",
          "const re = /from ['\"]/;",
          "import real from './dep.js';",
          "export const value = real + (re.test(\"from 'x'\") ? 1 : 0);",
        ].join("\n"),
        "/dep.js": "export default 10;",
      },
    });

    const ns = (await loader.run("/index.js")) as { value: number };
    expect(ns.value).toBe(11);
  });

  it("a genuine ESM import cycle falls back through the existing CJS/require() path for the back-edge, rather than hanging or throwing", async () => {
    const loader = createModuleLoader({
      sources: {
        "/package.json": '{"type":"module"}',
        "/a.js": "import { bFn } from './b.js';\nexport function aFn() { return 'a'; }\nexport const bKind = typeof bFn;",
        "/b.js": "import { aFn } from './a.js';\nexport function bFn() { return 'b'; }\nexport const aKind = typeof aFn;",
      },
    });

    const ns = (await loader.run("/a.js")) as { aFn: () => string; bKind: string };
    expect(ns.aFn()).toBe("a");
    expect(ns.bKind).toBe("function");
  });
});
