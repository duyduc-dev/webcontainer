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

const resolveRelative = (fromPath: string, specifier: string, sources: Record<string, string>): string => {
  for (const candidate of relativeModuleCandidates(fromPath, specifier)) {
    if (candidate in sources) return candidate;
  }
  throw new Error(`Cannot find module '${specifier}' from '${fromPath}'`);
};

/** The sync mirror of preload.ts's resolveBareSpecifier(), run against the
 * now-fully-populated in-memory `sources` map instead of doing I/O - see
 * moduleLoader.ts's own module doc comment for why the same algorithm has to
 * exist in both an async (preload-time) and sync (require-time) form. Returns
 * null (not a throw) on a miss so the caller can report the ORIGINAL
 * specifier in its error, not an internal resolution detail. */
const resolveBareSync = (fromPath: string, specifier: string, sources: Record<string, string>): string | null => {
  const { packageName, subpath } = splitBareSpecifier(specifier);

  for (const nodeModulesDir of nodeModulesDirsFrom(fromPath)) {
    const pkgDir = `${nodeModulesDir}/${packageName}`;

    if (subpath) {
      const match = fileCandidates(`${pkgDir}/${subpath}`).find((candidate) => candidate in sources);
      if (match) return match;
      continue;
    }

    let main = "index.js";
    const pkgJsonPath = `${pkgDir}/package.json`;
    if (pkgJsonPath in sources) {
      try {
        main = (JSON.parse(sources[pkgJsonPath]!) as { main?: string }).main ?? "index.js";
      } catch {
        // Malformed package.json - fall through to the plain index.js guess.
      }
    }

    const match = fileCandidates(normalize(`${pkgDir}/${main}`)).find((candidate) => candidate in sources);
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
  const builtins = {
    ...createBuiltinModules(options.process ?? defaultProcess, options.netContext),
    ...options.builtins,
  };
  const cache = new Map<string, ModuleRecord>();

  const createRequire = (fromPath: string) => {
    return (specifier: string): unknown => {
      if (specifier in builtins) return builtins[specifier];

      if (specifier.startsWith(".")) {
        return loadModule(resolveRelative(fromPath, specifier, sources)).exports;
      }

      const resolved = resolveBareSync(fromPath, specifier, sources);
      if (resolved) return loadModule(resolved).exports;

      throw new Error(`Cannot find module '${specifier}' from '${fromPath}'`);
    };
  };

  const loadModule = (path: string): ModuleRecord => {
    const cached = cache.get(path);
    if (cached) return cached;

    const record: ModuleRecord = { exports: {} };
    cache.set(path, record);

    const source = sources[path];
    if (source === undefined) throw new Error(`Cannot find module '${path}'`);

    if (path.endsWith(".json")) {
      record.exports = JSON.parse(source);
      return record;
    }

    const wrapper = new Function("module", "exports", "require", "__filename", "__dirname", source);
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
