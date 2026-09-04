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
});
