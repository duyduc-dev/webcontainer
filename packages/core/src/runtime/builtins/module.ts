// Hand-written, not vendored: real Node's lib/internal/modules/cjs/loader.js
// is the module SYSTEM itself (Module class, require() construction,
// resolution internals) - reimplementing that isn't this runtime's module
// builtin's job (moduleLoader.ts already IS the module system). This only
// exposes what real code actually reaches for via `require('module')`:
// traced need is validate-npm-package-name's own
// `const { builtinModules } = require('module')`, used to reject a package
// name that collides with a reserved core-module name, and real Vite's own
// dist/node/chunks/node.js repeatedly doing `createRequire(import.meta.url)`
// - the standard ESM "give me a require() scoped to this file" pattern (used
// both as a plain require() and via one-off calls like
// `createRequire(import.meta.url)("pnpapi")`).
//
// builtinModules deliberately lists what THIS runtime itself provides
// (including `fs`, injected separately by worker.ts rather than through the
// shared builtins registry - see builtins/index.ts's own BUILTIN_NAMES doc
// comment), not real Node's much longer historical list (cluster, dgram,
// ...) - this runtime doesn't implement those, so claiming they're reserved
// would be a bigger lie than a shorter list. `worker_threads` is listed
// despite being only partially real (see worker_threads.ts's own doc
// comment - MessageChannel works, Worker throws) since the module itself
// genuinely exists and is `require()`-able, which is what this list means.
const BUILTIN_MODULE_NAMES = [
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "constants",
  "crypto",
  "dns",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "timers/promises",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
];

/** `createRequireForPath(fromPath)` is moduleLoader.ts's own internal
 * createRequire(fromPath), threaded down through builtins/index.ts - reused
 * verbatim (including its real `.resolve`, per real Node's own
 * createRequire() contract - traced need: real rolldown's own WebContainer
 * fallback does `__require.resolve('rolldown/package.json')`) rather than
 * reimplementing resolution here, same as every other builtin that leans on
 * the real require graph. */
const createModuleModule = (createRequireForPath: (fromPath: string) => ((specifier: string) => unknown) & { resolve(specifier: string): string }) => {
  const createRequire = (filename: string): ((specifier: string) => unknown) & { resolve(specifier: string): string } => {
    // `filename` is real Vite's own import.meta.url, i.e. exactly the
    // `file://<path>` string this runtime's own ESM loader produces (see
    // esmLoader.ts's IMPORT_META_URL_RE handling) - stripped back to a plain
    // path via a simple prefix strip, not full RFC 8089 file: URL parsing:
    // every file: URL this runtime itself ever produces is a simple absolute
    // POSIX path with no host/percent-encoding, so nothing more is needed.
    const fromPath = filename.startsWith("file://") ? filename.slice("file://".length) : filename;
    return createRequireForPath(fromPath);
  };

  // Real Node's `Module` class itself - traced need: real Vite's own
  // dist/node/chunks/node.js does `import { Module, ... } from 'node:module'`
  // at its top level (so, like `createRequire`, the import must resolve
  // unconditionally), then ONLY ever touches `Module.register` and
  // `Module.registerHooks` (both purely as presence checks -
  // `if (Module.registerHooks) return ...; if (Module.register) return ...;`
  // - real Node feature-detecting its own experimental off-thread/on-thread
  // ESM-loader-hook APIs, added in Node 20.6/22.15, to build an off-thread
  // config-file importer). Deliberately left `undefined` on both, rather
  // than faked: implementing real loader-hook registration is a substantial
  // separate undertaking nothing has traced an actual need for yet (same
  // "throw/omit rather than fake" precedent as vm.ts's
  // runInNewContext/createContext and worker_threads.ts's own `Worker`) -
  // this correctly makes Vite fall back to its own no-off-thread-importer
  // path, exactly like it would on a real older Node lacking these APIs.
  // `builtinModules`/`createRequire` ARE real here (not undefined) since
  // real Node's `Module` class carries both as genuine static properties
  // too, and this runtime already has real values for them (no extra work,
  // not a guess).
  const Module = { builtinModules: BUILTIN_MODULE_NAMES, createRequire };

  return {
    builtinModules: BUILTIN_MODULE_NAMES,
    isBuiltin: (specifier: string): boolean => {
      const name = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
      return BUILTIN_MODULE_NAMES.includes(name);
    },
    createRequire,
    Module,
  };
};

export { createModuleModule };
