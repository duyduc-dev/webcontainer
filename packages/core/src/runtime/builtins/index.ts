import { createNodeModules } from "../node/loader";
import pathModule from "./path";
import utilModule from "./util";

interface ProcessLike {
  nextTick(callback: (...args: unknown[]) => void, ...args: unknown[]): void;
  env?: Record<string, string>;
}

/** Bare specifiers resolved without going through the FS - checked before any
 * relative/npm lookup. Kept as a plain name list (no process needed) so
 * preload.ts can test membership without constructing any module. Must be
 * kept in sync with the module list below (and with runtime/node/loader.ts's
 * FACTORIES table, for anything meant to be guest-require()-able rather than
 * only reachable from inside other vendored modules). */
const BUILTIN_NAMES = new Set([
  "path",
  "util",
  "events",
  "stream",
  "buffer",
  "http",
  "https",
  "crypto",
  "zlib",
  "async_hooks",
]);

const isBuiltinSpecifier = (specifier: string): boolean => BUILTIN_NAMES.has(specifier);

/**
 * Builds the require()-able builtins record for one process. `events`,
 * `stream`, `buffer`, `http`, `https`, `crypto`, `zlib`, and `async_hooks`
 * resolve through real vendored Node source (runtime/node/loader.ts) rather
 * than hand-written approximations; `path` and `util` stay hand-written until
 * their own real lib/ modules are vendored.
 */
const createBuiltinModules = (process: ProcessLike): Record<string, unknown> => {
  const nodeModules = createNodeModules(process);
  return {
    path: pathModule,
    util: utilModule,
    events: nodeModules.require("events"),
    stream: nodeModules.require("stream"),
    buffer: nodeModules.require("buffer"),
    http: nodeModules.require("http"),
    https: nodeModules.require("https"),
    crypto: nodeModules.require("crypto"),
    zlib: nodeModules.require("zlib"),
    async_hooks: nodeModules.require("async_hooks"),
  };
};

export { createBuiltinModules, isBuiltinSpecifier };
export type { ProcessLike };
