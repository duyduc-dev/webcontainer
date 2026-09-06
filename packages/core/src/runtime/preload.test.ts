import { describe, expect, it } from "vitest";
import { preloadModuleGraph } from "./preload";

const readFileFrom = (files: Record<string, string>) => async (path: string): Promise<string> => {
  if (!(path in files)) throw new Error(`ENOENT: ${path}`);
  return files[path];
};

describe("preloadModuleGraph", () => {
  it("preloads only the entry when it has no relative requires", async () => {
    const { sources } = await preloadModuleGraph("/index.js", readFileFrom({ "/index.js": "1;" }));
    expect(sources).toEqual({ "/index.js": "1;" });
  });

  it("follows a chain of relative requires", async () => {
    const files = {
      "/index.js": "require('./a');",
      "/a.js": "require('./b');",
      "/b.js": "1;",
    };

    const { sources } = await preloadModuleGraph("/index.js", readFileFrom(files));

    expect(Object.keys(sources).sort()).toEqual(["/a.js", "/b.js", "/index.js"]);
  });

  it("resolves a directory-style require to its index.js during preload", async () => {
    const files = {
      "/index.js": "require('./lib');",
      "/lib/index.js": "1;",
    };

    const { sources } = await preloadModuleGraph("/index.js", readFileFrom(files));

    expect(sources["/lib/index.js"]).toBe("1;");
  });

  it("does not try to fetch a builtin specifier from the FS", async () => {
    const files = { "/index.js": "require('path'); require('events');" };

    const { sources } = await preloadModuleGraph("/index.js", readFileFrom(files));

    expect(Object.keys(sources)).toEqual(["/index.js"]);
  });

  it("skips an unresolvable relative require instead of throwing", async () => {
    const files = { "/index.js": "require('./missing');" };

    const { sources } = await preloadModuleGraph("/index.js", readFileFrom(files));

    expect(Object.keys(sources)).toEqual(["/index.js"]);
  });

  it("does not revisit a module required from multiple places", async () => {
    const files = {
      "/index.js": "require('./a'); require('./b');",
      "/a.js": "require('./shared');",
      "/b.js": "require('./shared');",
      "/shared.js": "1;",
    };

    const { sources } = await preloadModuleGraph("/index.js", readFileFrom(files));

    expect(Object.keys(sources).sort()).toEqual(["/a.js", "/b.js", "/index.js", "/shared.js"]);
  });

  it("resolves a bare specifier's package.json \"main\" field", async () => {
    const files = {
      "/index.js": "require('left-pad');",
      "/node_modules/left-pad/package.json": '{"main":"lib/pad.js"}',
      "/node_modules/left-pad/lib/pad.js": "module.exports = () => {};",
    };

    const { sources } = await preloadModuleGraph("/index.js", readFileFrom(files));

    expect(Object.keys(sources).sort()).toEqual([
      "/index.js",
      "/node_modules/left-pad/lib/pad.js",
      "/node_modules/left-pad/package.json",
    ]);
  });

  it("falls back to index.js when a package has no package.json", async () => {
    const files = {
      "/index.js": "require('tiny-pkg');",
      "/node_modules/tiny-pkg/index.js": "module.exports = 1;",
    };

    const { sources } = await preloadModuleGraph("/index.js", readFileFrom(files));

    expect(sources["/node_modules/tiny-pkg/index.js"]).toBe("module.exports = 1;");
  });

  it("resolves a bare specifier's subpath directly, bypassing \"main\"", async () => {
    const files = {
      "/index.js": "require('lodash/map');",
      "/node_modules/lodash/package.json": '{"main":"lodash.js"}',
      "/node_modules/lodash/map.js": "module.exports = () => {};",
    };

    const { sources } = await preloadModuleGraph("/index.js", readFileFrom(files));

    expect(Object.keys(sources).sort()).toEqual(["/index.js", "/node_modules/lodash/map.js"]);
  });

  it("resolves a scoped package", async () => {
    const files = {
      "/index.js": "require('@org/pkg');",
      "/node_modules/@org/pkg/package.json": '{"main":"index.js"}',
      "/node_modules/@org/pkg/index.js": "module.exports = 1;",
    };

    const { sources } = await preloadModuleGraph("/index.js", readFileFrom(files));

    expect(sources["/node_modules/@org/pkg/index.js"]).toBe("module.exports = 1;");
  });

  it("prefers a nested node_modules package over a hoisted one at the same specifier", async () => {
    const files = {
      "/a-dir/index.js": "require('dep');",
      "/node_modules/dep/index.js": "module.exports = 'hoisted';",
      "/a-dir/node_modules/dep/index.js": "module.exports = 'nested';",
    };

    const { sources } = await preloadModuleGraph("/a-dir/index.js", readFileFrom(files));

    expect(sources["/a-dir/node_modules/dep/index.js"]).toBe("module.exports = 'nested';");
    expect(sources["/node_modules/dep/index.js"]).toBeUndefined();
  });

  it("skips an unresolvable bare specifier instead of throwing", async () => {
    const files = { "/index.js": "require('does-not-exist');" };

    const { sources } = await preloadModuleGraph("/index.js", readFileFrom(files));

    expect(Object.keys(sources)).toEqual(["/index.js"]);
  });
});
