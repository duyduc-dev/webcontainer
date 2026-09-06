// Hand-written, not vendored: real Node's lib/internal/modules/cjs/loader.js
// is the module SYSTEM itself (Module class, require() construction,
// resolution internals) - reimplementing that isn't this runtime's module
// builtin's job (moduleLoader.ts already IS the module system). This only
// exposes what real code actually reaches for via `require('module')`:
// traced need is validate-npm-package-name's own
// `const { builtinModules } = require('module')`, used to reject a package
// name that collides with a reserved core-module name.
//
// builtinModules deliberately lists what THIS runtime itself provides
// (including `fs`, injected separately by worker.ts rather than through the
// shared builtins registry - see builtins/index.ts's own BUILTIN_NAMES doc
// comment), not real Node's much longer historical list (cluster, dgram,
// readline, vm, worker_threads, ...) - this runtime doesn't implement those,
// so claiming they're reserved would be a bigger lie than a shorter list.
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
  "process",
  "querystring",
  "stream",
  "string_decoder",
  "timers/promises",
  "tls",
  "tty",
  "url",
  "util",
  "zlib",
];

const createModuleModule = () => ({
  builtinModules: BUILTIN_MODULE_NAMES,
  isBuiltin: (specifier: string): boolean => {
    const name = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
    return BUILTIN_MODULE_NAMES.includes(name);
  },
});

export { createModuleModule };
