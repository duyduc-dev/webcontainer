import { dirname, normalize } from "../kernel/fs/path";
import { createBuiltinModules } from "./builtins";
import type { ProcessLike } from "./builtins";
import type { NodeModulesContext } from "./node/loader";
import { fileCandidates, nodeModulesDirsFrom, relativeModuleCandidates, splitBareSpecifier } from "./resolveSpecifier";

interface ModuleLoaderOptions {
  sources: Record<string, string>;
  /** Extra/overriding builtins (e.g. a per-process `fs`) merged over the vendored/hand-written registry. */
  builtins?: Record<string, unknown>;
  /** Real Node-style process the vendored builtins (events/stream/buffer) run
   * against. Defaults to a microtask-based nextTick when omitted. */
  process?: ProcessLike;
  /** 'net's liveness/close-phase/cross-process hooks — see createBuiltinModules. */
  netContext?: NodeModulesContext;
  /**
   * Synchronous fallback for a candidate path missing from `sources` - the
   * ahead-of-boot preload (preload.ts) finds require() targets with a regex
   * over string-literal arguments, so it can't see a specifier built at
   * runtime from a variable (e.g. real npm's own lib/cli.js:
   * `const cliEntry = require('path').resolve(__dirname, 'cli/entry.js');
   * require(cliEntry)` - `entry.js` is never a string literal anywhere
   * `require(` appears). The file is still real and already sitting in the
   * mounted VFS; this callback (backed by the same synchronous
   * SharedArrayBuffer fs bridge guest `fs.*Sync` calls use) reads it on a
   * cache miss instead of that miss being a hard, wrong "Cannot find
   * module". Returns null (not a throw) for a real ENOENT, so callers still
   * report the ORIGINAL specifier, not this internal probe.
   */
  readFileSync?: (path: string) => string | null;
}

const defaultProcess: ProcessLike = {
  nextTick: (callback, ...args) => {
    queueMicrotask(() => callback(...args));
  },
};

interface ModuleRecord {
  exports: unknown;
}

interface ModuleLoader {
  run(entryPath: string): unknown;
}

// Real Node strips a leading shebang line before compiling a CommonJS module
// (so `#!/usr/bin/env node` scripts - e.g. npm's own bin/npm-cli.js - can be
// `require()`d, not just executed directly) - `new Function` has no such
// carve-out and treats a bare `#` as a syntax error.
const stripShebang = (source: string): string =>
  source.startsWith("#!") ? source.slice(source.indexOf("\n") + 1) : source;

type SourceReader = (path: string) => string | undefined;

/** Wraps `sources` with the optional readFileSync fallback (see
 * ModuleLoaderOptions.readFileSync) into one lookup every candidate-checking
 * call below shares: a hit from the fallback is written back into `sources`
 * so a second require() of the same path is a plain cache hit, not a second
 * round-trip through the sync fs bridge. */
const createSourceReader = (sources: Record<string, string>, readFileSync?: (path: string) => string | null): SourceReader => {
  return (path) => {
    const cached = sources[path];
    if (cached !== undefined) return cached;
    const fallback = readFileSync?.(path);
    if (fallback === null || fallback === undefined) return undefined;
    sources[path] = fallback;
    return fallback;
  };
};

const resolveRelative = (fromPath: string, specifier: string, readSource: SourceReader): string => {
  for (const candidate of relativeModuleCandidates(fromPath, specifier)) {
    if (readSource(candidate) !== undefined) return candidate;
  }
  throw new Error(`Cannot find module '${specifier}' from '${fromPath}'`);
};

/** The sync mirror of preload.ts's resolveBareSpecifier(), run against the
 * now-fully-populated in-memory `sources` map instead of doing I/O - see
 * moduleLoader.ts's own module doc comment for why the same algorithm has to
 * exist in both an async (preload-time) and sync (require-time) form. Returns
 * null (not a throw) on a miss so the caller can report the ORIGINAL
 * specifier in its error, not an internal resolution detail. */
const resolveBareSync = (fromPath: string, specifier: string, readSource: SourceReader): string | null => {
  const { packageName, subpath } = splitBareSpecifier(specifier);

  for (const nodeModulesDir of nodeModulesDirsFrom(fromPath)) {
    const pkgDir = `${nodeModulesDir}/${packageName}`;

    if (subpath) {
      const match = fileCandidates(`${pkgDir}/${subpath}`).find((candidate) => readSource(candidate) !== undefined);
      if (match) return match;
      continue;
    }

    let main = "index.js";
    const pkgJsonSource = readSource(`${pkgDir}/package.json`);
    if (pkgJsonSource !== undefined) {
      try {
        main = (JSON.parse(pkgJsonSource) as { main?: string }).main ?? "index.js";
      } catch {
        // Malformed package.json - fall through to the plain index.js guess.
      }
    }

    const match = fileCandidates(normalize(`${pkgDir}/${main}`)).find((candidate) => readSource(candidate) !== undefined);
    if (match) return match;
  }

  return null;
};

/**
 * Minimal CommonJS loader over a fully preloaded source map (Phase 4's "static
 * transport" - no lazy fs access from inside the process worker). Relative
 * requires, the builtins registry, and bare (node_modules) specifiers are all
 * supported; package.json "exports"/"imports" conditional resolution is not
 * (see resolveSpecifier.ts's header) - only the older "main"-field + plain-
 * subpath algorithm, still correct for any package that doesn't opt into
 * "exports".
 */
const createModuleLoader = (options: ModuleLoaderOptions): ModuleLoader => {
  const { sources } = options;
  const readSource = createSourceReader(sources, options.readFileSync);
  const builtins = {
    ...createBuiltinModules(options.process ?? defaultProcess, options.netContext),
    ...options.builtins,
  };
  const cache = new Map<string, ModuleRecord>();

  const createRequire = (fromPath: string) => {
    return (rawSpecifier: string): unknown => {
      // Real Node accepts a "node:"-prefixed specifier for any builtin (and,
      // as of newer versions, requires it for a few) - strip it before every
      // other check so `require('node:path')` and `require('path')` resolve
      // identically.
      const specifier = rawSpecifier.startsWith("node:") ? rawSpecifier.slice(5) : rawSpecifier;

      if (specifier in builtins) return builtins[specifier];

      if (specifier.startsWith(".")) {
        return loadModule(resolveRelative(fromPath, specifier, readSource)).exports;
      }

      // An absolute-path specifier - real Node supports this directly (no
      // node_modules walk, no "main" field, just the same file/directory
      // candidate suffixes a relative require tries). This is how a thin
      // `/bin/<name>.js` shim can load a real, separately-vendored program by
      // its absolute VFS path (e.g. a vendored npm's bin/npm-cli.js).
      if (specifier.startsWith("/")) {
        const resolved = fileCandidates(specifier).find((candidate) => readSource(candidate) !== undefined);
        if (resolved) return loadModule(resolved).exports;
        throw new Error(`Cannot find module '${specifier}'`);
      }

      const resolved = resolveBareSync(fromPath, specifier, readSource);
      if (resolved) return loadModule(resolved).exports;

      throw new Error(`Cannot find module '${specifier}' from '${fromPath}'`);
    };
  };

  const loadModule = (path: string): ModuleRecord => {
    const cached = cache.get(path);
    if (cached) return cached;

    const record: ModuleRecord = { exports: {} };
    cache.set(path, record);

    const source = readSource(path);
    if (source === undefined) throw new Error(`Cannot find module '${path}'`);

    if (path.endsWith(".json")) {
      record.exports = JSON.parse(source);
      return record;
    }

    let wrapper: (module: unknown, exports: unknown, require: unknown, filename: string, dirname: string) => void;
    try {
      wrapper = new Function(
        "module",
        "exports",
        "require",
        "__filename",
        "__dirname",
        stripShebang(source),
      ) as typeof wrapper;
    } catch (error) {
      // A bare SyntaxError from `new Function` names neither the file nor
      // even which require() pulled it in - both matter here (this loader
      // only ever accepts CommonJS; a `.mjs`/ESM file with top-level import/
      // export would fail exactly like this).
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message} while parsing '${path}'`);
    }
    const moduleObj = { exports: record.exports };
    wrapper(moduleObj, moduleObj.exports, createRequire(path), path, dirname(path));
    record.exports = moduleObj.exports;

    return record;
  };

  return {
    run(entryPath: string): unknown {
      return loadModule(entryPath).exports;
    },
  };
};

export { createModuleLoader };
export type { ModuleLoaderOptions };
