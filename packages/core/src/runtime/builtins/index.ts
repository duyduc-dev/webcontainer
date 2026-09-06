import { createNodeModules } from "../node/loader";
import type { NodeModulesContext } from "../node/loader";
import { createConstantsModule } from "./constants";
import { createAssertModule } from "./assert";
import { createModuleModule } from "./module";
import { createHttp2Module } from "./http2";
import { createOsModule } from "./os";
import { createQuerystringModule } from "./querystring";
import { createTimersPromisesModule } from "./timersPromises";
import { createStringDecoderModule } from "./string_decoder";
import { createTtyModule } from "./tty";
import { createUrlModule } from "./url";
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
  "os",
  "tty",
  "process",
  "constants",
  "url",
  "querystring",
  "string_decoder",
  "timers/promises",
  "module",
  "assert",
  "events",
  "stream",
  "buffer",
  "http",
  "https",
  "http2",
  "crypto",
  "zlib",
  "async_hooks",
  "net",
  "dns",
  "tls",
  "child_process",
]);

const isBuiltinSpecifier = (specifier: string): boolean => BUILTIN_NAMES.has(specifier);

/**
 * Builds the require()-able builtins record for one process. `events`,
 * `stream`, `buffer`, `http`, `https`, `crypto`, `zlib`, `async_hooks`,
 * `net`, `dns`, `tls`, and `child_process` resolve through real vendored (or,
 * for `child_process` — like `net`'s bindings — hand-written) Node source
 * (runtime/node/loader.ts) rather than hand-written approximations; `path`
 * and `util` stay hand-written until their own real lib/ modules are vendored.
 *
 * `net`'s liveness/close-phase/cross-process hooks and `child_process`'s
 * spawn/exec relay both come from `netContext` (the calling process worker's
 * own event loop + kernel bridge) — omitted, `net` still works for
 * same-process listen()/connect() via loader.ts's nextTick-based fallbacks
 * (just without real close-phase ordering or cross-process reachability),
 * and `child_process.spawn()`/`exec()` throw clearly instead of silently
 * doing nothing.
 */
const createBuiltinModules = (process: ProcessLike, netContext?: NodeModulesContext): Record<string, unknown> => {
  const nodeModules = createNodeModules(process, netContext);
  return {
    path: pathModule,
    util: utilModule,
    os: createOsModule(process),
    tty: createTtyModule(),
    constants: createConstantsModule(),
    url: createUrlModule(),
    querystring: createQuerystringModule(),
    string_decoder: createStringDecoderModule(),
    "timers/promises": createTimersPromisesModule(),
    module: createModuleModule(),
    assert: createAssertModule(),
    // Real Node exposes `process` both as a bare global AND as
    // require('process')/require('node:process'), the same object either
    // way - modern code (e.g. supports-color, vendored inside real npm's
    // own chalk dependency) increasingly does `import process from
    // 'node:process'` instead of relying on the global. `process` here is
    // whatever the caller's own global `process` already is (worker.ts
    // passes the real, EventEmitter-mixed-in processGlobal) - not a second,
    // divergent instance.
    process,
    events: nodeModules.require("events"),
    stream: nodeModules.require("stream"),
    buffer: nodeModules.require("buffer"),
    http: nodeModules.require("http"),
    https: nodeModules.require("https"),
    http2: createHttp2Module(),
    crypto: nodeModules.require("crypto"),
    zlib: nodeModules.require("zlib"),
    async_hooks: nodeModules.require("async_hooks"),
    net: nodeModules.require("net"),
    dns: nodeModules.require("dns"),
    tls: nodeModules.require("tls"),
    child_process: nodeModules.require("child_process"),
  };
};

export { createBuiltinModules, isBuiltinSpecifier };
export type { ProcessLike };
