import { describe, expect, it } from "vitest";
import { createEsmLoader } from "./esmLoader";
import type { EsmLoaderOptions } from "./esmLoader";

const throwingRequireSync: EsmLoaderOptions["requireSync"] = (fromPath, specifier) => {
  throw new Error(`unexpected requireSync(${JSON.stringify(fromPath)}, ${JSON.stringify(specifier)}) in a pure-ESM test`);
};

/** Builds an EsmLoaderOptions from a plain path->source map - the shared
 * setup shape every test below uses, matching moduleLoader.test.ts's own
 * inline-sources style. */
const makeLoader = (files: Record<string, string>, overrides: Partial<EsmLoaderOptions> = {}) =>
  createEsmLoader({
    readSource: (path) => files[path],
    requireSync: throwingRequireSync,
    resolvePackageImports: () => null,
    ...overrides,
  });

describe("esmLoader - diamond-dependency embedding size (regression for the exponential blowup)", () => {
  it("keeps output size roughly linear (not exponential) with diamond-graph depth", async () => {
    // Each level imports the level below it TWICE, under different local
    // bindings - an ordinary real-world shape (e.g. a barrel re-export
    // alongside a direct import). Before the fix, this measured ~2.67x
    // growth PER LEVEL (7.5KB at depth 1 -> 7.2MB at depth 8, ~970x). The
    // snapshot-shim fix should make each level's own contribution roughly
    // constant, so total growth across 8 levels should be nowhere near that.
    const LEAF_SIZE = 2000;
    const files: Record<string, string> = { "/leaf.mjs": `export const leaf = ${JSON.stringify("x".repeat(LEAF_SIZE))};\n` };
    for (let level = 0; level < 8; level++) {
      const childImport = level === 0 ? "/leaf.mjs" : `/level${level - 1}.mjs`;
      const childExport = level === 0 ? "leaf" : `v${level - 1}`;
      files[`/level${level}.mjs`] =
        `import { ${childExport} as a } from ${JSON.stringify(childImport)};\n` +
        `import { ${childExport} as b } from ${JSON.stringify(childImport)};\n` +
        `export const v${level} = a + b;\n`;
    }

    const depth1Loader = makeLoader(files);
    const depth1Size = (await depth1Loader.buildEntryDataUrl("/level0.mjs")).length;

    const depth8Loader = makeLoader(files);
    const depth8Size = (await depth8Loader.buildEntryDataUrl("/level7.mjs")).length;

    // Exponential growth at the old ~2.67x/level rate would put depth 8 at
    // roughly 970x depth 1 - a linear/constant-per-level fix should be
    // dramatically smaller than that. 20x leaves generous headroom for the
    // shim overhead itself while sharply distinguishing the two shapes.
    expect(depth8Size).toBeLessThan(depth1Size * 20);
  });
});

describe("esmLoader - accepted tradeoff: snapshot shims are not live bindings", () => {
  it("an exported let/var reassigned after initial evaluation is NOT observed by an importer (documented, deliberate limitation)", async () => {
    const files = {
      "/state.mjs": "export let x = 1;\nexport function bump() { x = 2; }\n",
      "/index.mjs": "import { x, bump } from './state.mjs';\nbump();\nexport const observed = x;\n",
    };
    const loader = makeLoader(files);
    const ns = (await loader.run("/index.mjs")) as { observed: number };

    // The accepted tradeoff: `observed` sees the value AT SNAPSHOT TIME (1),
    // not the reassigned value (2) - this is the deliberate, documented
    // limitation, not silent drift. If this ever starts failing because the
    // fix's snapshot strategy changed, that's a real, visible signal.
    expect(ns.observed).toBe(1);
  });

  it("mutating an exported object/function's own contents (not reassigning the binding) remains genuinely shared", async () => {
    const files = {
      "/state.mjs": "export const state = { count: 0 };\nexport function inc() { state.count++; }\n",
      "/index.mjs": "import { state, inc } from './state.mjs';\ninc();\ninc();\nexport const count = state.count;\n",
    };
    const loader = makeLoader(files);
    const ns = (await loader.run("/index.mjs")) as { count: number };
    expect(ns.count).toBe(2);
  });
});

describe("esmLoader - cycle handling under the async rewrite", () => {
  it("a genuine ESM import cycle's back-edge falls back through requireSync rather than hanging", async () => {
    const files = {
      "/a.mjs": "import { bFn } from './b.mjs';\nexport function aFn() { return 'a'; }\nexport const bKind = typeof bFn;\n",
      "/b.mjs": "import { aFn } from './a.mjs';\nexport function bFn() { return 'b'; }\nexport const aKind = typeof aFn;\n",
    };
    // A minimal stand-in for moduleLoader.ts's own circular-require
    // handling: the back-edge (b requiring a while a is still building)
    // gets a fixed, canned partial value - this test isn't re-verifying
    // real circular-CJS semantics (moduleLoader.test.ts already does,
    // against the real mechanism), only that esmLoader's own async
    // restructuring still resolves the FORWARD edge correctly and never
    // hangs/deadlocks when a back-edge falls through to requireSync.
    const loader = makeLoader(files, {
      requireSync: (fromPath, specifier) => {
        expect(fromPath).toBe("/b.mjs");
        expect(specifier).toBe("./a.mjs");
        return { aFn: () => "a", bKind: "function" };
      },
    });

    const ns = (await loader.run("/a.mjs")) as { aFn: () => string; bKind: string };
    expect(ns.aFn()).toBe("a");
    expect(ns.bKind).toBe("function");
  });

  it("a cycle combined with diamond-shaped reuse composes without hanging", async () => {
    // /a imports /shared and /b; /b imports /shared and /a (the cycle's
    // back-edge). /shared is reused from both sides of the cycle - stresses
    // esmShimCache/dataUrlCache/building all interacting at once under the
    // new async structure.
    const files = {
      "/shared.mjs": "export const value = 42;\n",
      "/a.mjs": "import { value } from './shared.mjs';\nimport { bFn } from './b.mjs';\nexport function aFn() { return value + 1; }\nexport const bKind = typeof bFn;\n",
      "/b.mjs": "import { value } from './shared.mjs';\nimport { aFn } from './a.mjs';\nexport function bFn() { return value + 2; }\nexport const aKind = typeof aFn;\n",
    };
    const loader = makeLoader(files, {
      requireSync: () => ({ aFn: () => 43, bKind: "function" }),
    });

    const ns = (await loader.run("/a.mjs")) as { aFn: () => number; bKind: string };
    expect(ns.aFn()).toBe(43);
    expect(ns.bKind).toBe("function");
  });
});

describe("esmLoader - concurrent dynamic imports of a shared static dependency", () => {
  it("evaluates a shared dependency exactly once when reached via concurrent dynamic import()", async () => {
    (globalThis as unknown as { __esmLoaderTestCounter: number }).__esmLoaderTestCounter = 0;
    const files = {
      "/c.mjs": "globalThis.__esmLoaderTestCounter++;\nexport const c = 1;\n",
      "/a.mjs": "import { c } from './c.mjs';\nexport const fromA = c;\n",
      "/b.mjs": "import { c } from './c.mjs';\nexport const fromB = c;\n",
      "/index.mjs":
        "const [a, b] = await Promise.all([import('./a.mjs'), import('./b.mjs')]);\nexport const fromA = a.fromA;\nexport const fromB = b.fromB;\n",
    };
    try {
      const loader = makeLoader(files);
      const ns = (await loader.run("/index.mjs")) as { fromA: number; fromB: number };
      expect(ns.fromA).toBe(1);
      expect(ns.fromB).toBe(1);
      expect((globalThis as unknown as { __esmLoaderTestCounter: number }).__esmLoaderTestCounter).toBe(1);
    } finally {
      delete (globalThis as unknown as { __esmLoaderTestCounter?: number }).__esmLoaderTestCounter;
    }
  });
});

describe("esmLoader - basic direct coverage", () => {
  it("resolves a static import and a lazy dynamic import of the same module to the same live value", async () => {
    const files = {
      "/dep.mjs": "export default 10;\n",
      "/index.mjs": "import def from './dep.mjs';\nconst dyn = await import('./dep.mjs');\nexport const value = def + dyn.default;\n",
    };
    const loader = makeLoader(files);
    const ns = (await loader.run("/index.mjs")) as { value: number };
    expect(ns.value).toBe(20);
  });

  it("a dynamic import() of a missing module doesn't crash module evaluation - only awaiting it rejects", async () => {
    const files = {
      "/index.mjs": "let failed = false;\ntry { await import('./missing.mjs'); } catch { failed = true; }\nexport const ok = failed;\n",
    };
    const loader = makeLoader(files);
    const ns = (await loader.run("/index.mjs")) as { ok: boolean };
    expect(ns.ok).toBe(true);
  });

  it("a specifier sitting inside a string/comment near a real import is never mistaken for one", async () => {
    const files = {
      "/dep.mjs": "export default 'real';\n",
      "/index.mjs": "// import fake from './nope.mjs'\nconst note = \"from './also-fake.mjs'\";\nimport real from './dep.mjs';\nexport const value = real + note.length;\n",
    };
    const loader = makeLoader(files);
    const ns = (await loader.run("/index.mjs")) as { value: string };
    expect(ns.value).toBe("real" + "from './also-fake.mjs'".length);
  });
});
