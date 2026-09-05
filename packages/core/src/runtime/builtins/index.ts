import { createNodeModules } from "../node/loader";
import pathModule from "./path";
import utilModule from "./util";

interface ProcessLike {
  nextTick(callback: (...args: unknown[]) => void, ...args: unknown[]): void;
  env?: Record<string, string>;
}

/** Bare specifiers resolved without going through the FS - checked before any
 * relative/npm lookup. Kept as a plain name list (no process needed) so
 * preload.ts can test membership without constructing any module. */
const BUILTIN_NAMES = new Set(["path", "util", "events", "stream", "buffer"]);

const isBuiltinSpecifier = (specifier: string): boolean => BUILTIN_NAMES.has(specifier);

/**
 * Builds the require()-able builtins record for one process. `events`,
 * `stream`, and `buffer` resolve through real vendored Node source
 * (runtime/node/loader.ts) rather than hand-written approximations; `path`
 * and `util` stay hand-written until their own real lib/ modules are vendored.
 */
const createBuiltinModules = (process: ProcessLike): Record<string, unknown> => {
  const nodeModules = createNodeModules(process);
  return {
    path: pathModule,
    util: utilModule,
    events: nodeModules.require("events"),
    stream: nodeModules.require("stream"),
    buffer: nodeModules.require("buffer"),
  };
};

export { createBuiltinModules, isBuiltinSpecifier };
export type { ProcessLike };
