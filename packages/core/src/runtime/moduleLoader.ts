import { dirname } from "../kernel/fs/path";
import { builtinModules } from "./builtins";
import { relativeModuleCandidates } from "./resolveSpecifier";

interface ModuleLoaderOptions {
  sources: Record<string, string>;
  /** Extra/overriding builtins (e.g. a per-process `fs`) merged over the static registry. */
  builtins?: Record<string, unknown>;
}

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

/**
 * Minimal CommonJS loader over a fully preloaded source map (Phase 4's "static
 * transport" - no lazy fs access from inside the process worker). Only relative
 * requires and the builtins registry are supported; bare/npm specifiers throw a
 * clear error until package installs land in a later phase.
 */
const createModuleLoader = (options: ModuleLoaderOptions): ModuleLoader => {
  const { sources } = options;
  const builtins = { ...builtinModules, ...options.builtins };
  const cache = new Map<string, ModuleRecord>();

  const createRequire = (fromPath: string) => {
    return (specifier: string): unknown => {
      if (specifier in builtins) return builtins[specifier];

      if (!specifier.startsWith(".")) {
        throw new Error(
          `Cannot find module '${specifier}': only relative requires and builtins (${Object.keys(builtins).join(", ")}) are supported`,
        );
      }

      return loadModule(resolveRelative(fromPath, specifier, sources)).exports;
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
