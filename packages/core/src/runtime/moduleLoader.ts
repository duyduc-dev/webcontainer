import { dirname, normalize } from "../kernel/fs/path";
import { createBuiltinModules } from "./builtins";
import type { ProcessLike } from "./builtins";
import { createEsmLoader } from "./esmLoader";
import { interopDefault, toNamespace, transformEsmToCjs } from "./esmInterop";
import type { NodeModulesContext } from "./node/loader";
import { CJS_EXPORT_CONDITIONS, fileCandidates, nodeModulesDirsFrom, relativeModuleCandidates, resolveExportsMap, splitBareSpecifier } from "./resolveSpecifier";

/** Marks an error as already tagged with the module path that actually threw
 * it - see loadModule()'s own catch for why this must only happen once, at
 * the originating frame. */
const MODULE_PATH_TAG = Symbol("dwcModulePath");

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

/** The exact same require() a CJS caller at `fromPath` would get, `.resolve`
 * included (real Node's own require.resolve()/createRequire() contract) -
 * not just a flat call, since `module.createRequire()`'s own real contract
 * needs `.resolve` too (traced need: real rolldown's own WebContainer
 * fallback does `__require.resolve('rolldown/package.json')`). */
type RequireLike = ((specifier: string) => unknown) & { resolve(specifier: string): string };

interface ModuleLoader {
  run(entryPath: string): Promise<unknown>;
  /** Exposed so a caller-supplied builtins override (worker.ts's own
   * `vendoredBuiltins`, built before this loader exists) can wire up
   * `module.createRequire()` after the fact once this loader is actually
   * ready. */
  createRequire(fromPath: string): RequireLike;
}

// Real Node strips a leading shebang line before compiling a CommonJS module
// (so `#!/usr/bin/env node` scripts - e.g. npm's own bin/npm-cli.js - can be
// `require()`d, not just executed directly) - `new Function` has no such
// carve-out and treats a bare `#` as a syntax error.
const stripShebang = (source: string): string =>
  source.startsWith("#!") ? source.slice(source.indexOf("\n") + 1) : source;

// `import(...)` is call-expression syntax, not something `new Function` lets
// us hand a callback for the way `require` works - rewritten to a call we DO
// control (bound per-module below, same as `require`) before compiling. The
// negative lookbehind keeps `foo.import(...)` (a property access, not the
// dynamic-import keyword) untouched.
const rewriteDynamicImportCalls = (source: string): string => source.replace(/(?<!\.)\bimport(\s*\()/g, "__dwcImport$1");

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

    let pkgJson: { main?: string; exports?: unknown } | undefined;
    const pkgJsonSource = readSource(`${pkgDir}/package.json`);
    if (pkgJsonSource !== undefined) {
      try {
        pkgJson = JSON.parse(pkgJsonSource) as { main?: string; exports?: unknown };
      } catch {
        // Malformed package.json - fall through to the legacy guesses below.
      }
    }

    // Real Node: an "exports" field takes over resolution ENTIRELY for this
    // package - "main" and plain subpath file-guessing are not consulted as
    // a fallback when it's present, even if it doesn't resolve this
    // particular subpath (that's a real ERR_PACKAGE_PATH_NOT_EXPORTED case,
    // not "try the old way instead"). Traced need: real @napi-rs/wasm-runtime
    // (see resolveSpecifier.ts's own doc comment on CJS_EXPORT_CONDITIONS)
    // ships no "main" field at all, only `{".": {"import": "...", "require":
    // "...cjs"}}` - the legacy guess below would only ever find its README.
    if (pkgJson?.exports !== undefined) {
      const target = resolveExportsMap(pkgJson.exports, subpath ? `./${subpath}` : ".", CJS_EXPORT_CONDITIONS);
      if (target === null) continue;
      const match = fileCandidates(normalize(`${pkgDir}/${target}`)).find((candidate) => readSource(candidate) !== undefined);
      if (match) return match;
      continue;
    }

    if (subpath) {
      const match = fileCandidates(`${pkgDir}/${subpath}`).find((candidate) => readSource(candidate) !== undefined);
      if (match) return match;
      continue;
    }

    const main = pkgJson?.main ?? "index.js";
    const match = fileCandidates(normalize(`${pkgDir}/${main}`)).find((candidate) => readSource(candidate) !== undefined);
    if (match) return match;
  }

  return null;
};

/** Walks up from `dirname(fromPath)` looking for the nearest package.json -
 * the "owning package" a `#specifier` (see resolvePackageImportsSync) is
 * private to. Not node_modules-specific: a package's own "imports" map
 * applies to every file inside it, however deeply nested. */
const findPackageRoot = (fromPath: string, readSource: SourceReader): string | null => {
  let dir = dirname(fromPath);
  for (;;) {
    // dir === "/" is the one case `${dir}/package.json` would double up the
    // leading slash ("//package.json") and never match the real root-level
    // "/package.json" key - same root-joining special case as
    // resolveSpecifier.ts's nodeModulesDirsFrom.
    if (readSource(dir === "/" ? "/package.json" : `${dir}/package.json`) !== undefined) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

/**
 * Resolves a `#`-prefixed specifier via its owning package's own
 * package.json `"imports"` map (real Node's "package imports" feature -
 * distinct from, and unrelated to, the node_modules bare-specifier lookup
 * `resolveBareSync` does above). Needed by real chalk@5's own source, which
 * imports `#ansi-styles`/`#supports-color` this way. Only exact-key lookup
 * and a `node`/`default`-preferring pick from a conditional object value are
 * supported - no wildcard/pattern keys (chalk's own map doesn't use them,
 * and this loader has no other caller for `"imports"` yet). Returns null
 * (not a throw) on any miss, same convention as resolveBareSync.
 */
const resolvePackageImportsSync = (fromPath: string, specifier: string, readSource: SourceReader): string | null => {
  const packageRoot = findPackageRoot(fromPath, readSource);
  if (!packageRoot) return null;

  const pkgJsonSource = readSource(`${packageRoot}/package.json`);
  if (pkgJsonSource === undefined) return null;

  let imports: Record<string, unknown>;
  try {
    imports = (JSON.parse(pkgJsonSource) as { imports?: Record<string, unknown> }).imports ?? {};
  } catch {
    return null;
  }

  const mapping = imports[specifier];
  const target =
    typeof mapping === "string"
      ? mapping
      : mapping && typeof mapping === "object"
        ? ((mapping as Record<string, string>).node ??
          (mapping as Record<string, string>).default ??
          Object.values(mapping as Record<string, string>)[0])
        : undefined;
  if (typeof target !== "string") return null;

  return fileCandidates(normalize(`${packageRoot}/${target}`)).find((candidate) => readSource(candidate) !== undefined) ?? null;
};

/**
 * Minimal CommonJS loader over a fully preloaded source map (Phase 4's "static
 * transport" - no lazy fs access from inside the process worker). Relative
 * requires, the builtins registry, and bare (node_modules) specifiers are all
 * supported; package.json "exports" conditional resolution is not (see
 * resolveSpecifier.ts's header) - only the older "main"-field + plain-subpath
 * algorithm, still correct for any package that doesn't opt into "exports".
 * "imports" (private `#specifier` subpath imports) IS supported, via
 * resolvePackageImportsSync above - a distinct, much smaller algorithm
 * (exact-key lookup only, no patterns) added specifically for real chalk@5's
 * own `#ansi-styles`/`#supports-color` imports.
 *
 * A dynamic `import(...)` expression (rewritten to `__dwcImport` before
 * compiling - see rewriteDynamicImportCalls) and a genuinely ESM source file
 * that fails to compile as CommonJS (retried once through
 * esmInterop.ts's transformEsmToCjs) are both supported on a best-effort
 * basis - see esmInterop.ts's own doc comment for the concrete scope.
 */
const createModuleLoader = (options: ModuleLoaderOptions): ModuleLoader => {
  const { sources } = options;
  const readSource = createSourceReader(sources, options.readFileSync);
  const builtins = {
    // `(fromPath) => createRequire(fromPath)` forward-references `createRequire`
    // below (not yet initialized at this point in the function body) - safe
    // because it's wrapped in a closure that's only ever CALLED later, via
    // `module.createRequire()`'s returned function, well after this whole
    // synchronous setup phase completes (same forward-reference pattern
    // esmLoader's own `requireSync` option uses just below). Forwarding
    // `createRequire` itself (not a flattened `(fromPath, specifier) => ...`
    // call) is what gives `module.createRequire()`'s result a real
    // `.resolve` too, matching real Node's own contract.
    ...createBuiltinModules(options.process ?? defaultProcess, options.netContext, (fromPath) => createRequire(fromPath)),
    ...options.builtins,
  };
  const cache = new Map<string, ModuleRecord>();

  /** A builtin resolves to a marker rather than a path - require.resolve()
   * returns the specifier itself for a builtin (matching real Node), while
   * require() itself short-circuits to the builtin value before ever
   * needing a path at all. */
  const BUILTIN = Symbol("builtin");

  /** The specifier-to-path resolution require() and require.resolve() both
   * need, shared so they can never disagree about what a specifier means.
   * Returns BUILTIN for a builtin, the resolved path otherwise, or throws
   * the same "Cannot find module" real Node would for a genuine miss. */
  const resolveRequireTarget = (fromPath: string, rawSpecifier: string): string | typeof BUILTIN => {
    // Real Node accepts a "node:"-prefixed specifier for any builtin (and,
    // as of newer versions, requires it for a few) - strip it before every
    // other check so `require('node:path')` and `require('path')` resolve
    // identically.
    const specifier = rawSpecifier.startsWith("node:") ? rawSpecifier.slice(5) : rawSpecifier;

    if (specifier in builtins) return BUILTIN;

    if (specifier.startsWith(".")) {
      return resolveRelative(fromPath, specifier, readSource);
    }

    // An absolute-path specifier - real Node supports this directly (no
    // node_modules walk, no "main" field, just the same file/directory
    // candidate suffixes a relative require tries). This is how a thin
    // `/bin/<name>.js` shim can load a real, separately-vendored program by
    // its absolute VFS path (e.g. a vendored npm's bin/npm-cli.js).
    if (specifier.startsWith("/")) {
      const resolved = fileCandidates(specifier).find((candidate) => readSource(candidate) !== undefined);
      if (resolved) return resolved;
      throw new Error(`Cannot find module '${specifier}'`);
    }

    // A private package-imports specifier (real Node's "imports" field) -
    // e.g. chalk@5's own `require('#ansi-styles')`. Checked before the
    // node_modules walk below since a leading "#" can never be a bare
    // package name.
    if (specifier.startsWith("#")) {
      const resolved = resolvePackageImportsSync(fromPath, specifier, readSource);
      if (resolved) return resolved;
      throw new Error(`Cannot find package import '${specifier}' from '${fromPath}'`);
    }

    const resolved = resolveBareSync(fromPath, specifier, readSource);
    if (resolved) return resolved;

    throw new Error(`Cannot find module '${specifier}' from '${fromPath}'`);
  };

  const createRequire = (fromPath: string) => {
    const requireFn = (rawSpecifier: string): unknown => {
      const target = resolveRequireTarget(fromPath, rawSpecifier);
      if (target === BUILTIN) {
        const specifier = rawSpecifier.startsWith("node:") ? rawSpecifier.slice(5) : rawSpecifier;
        return builtins[specifier];
      }
      return loadModule(target).exports;
    };

    // require.resolve() - real Node's "give me the path, don't load it"
    // escape hatch. Traced need: real npm's own dependency tree (e.g.
    // @npmcli/run-script's make-spawn-args.js) calls this directly to find
    // a binary/script's location without actually require()ing it.
    requireFn.resolve = (rawSpecifier: string): string => {
      const target = resolveRequireTarget(fromPath, rawSpecifier);
      // Real Node's require.resolve() returns a core module's own name back
      // (`require.resolve('fs') === 'fs'`), not a file path.
      return target === BUILTIN ? rawSpecifier : target;
    };

    return requireFn;
  };

  /** Backs a compiled module's rewritten `__dwcImport(...)` call - real
   * dynamic `import()`, always async, resolved through the same graph
   * `require` uses (same branch order) and wrapped into a namespace object
   * (see esmInterop.ts's toNamespace) since that's the shape real `import()`
   * actually hands back, not a bare CJS `module.exports`. */
  const createDynamicImport = (fromPath: string) => {
    return async (rawSpecifier: string): Promise<Record<string, unknown>> => {
      const specifier = rawSpecifier.startsWith("node:") ? rawSpecifier.slice(5) : rawSpecifier;

      if (specifier in builtins) return toNamespace(builtins[specifier]);

      if (specifier.startsWith(".")) {
        return toNamespace(loadModule(resolveRelative(fromPath, specifier, readSource)).exports);
      }

      if (specifier.startsWith("/")) {
        const resolved = fileCandidates(specifier).find((candidate) => readSource(candidate) !== undefined);
        if (resolved) return toNamespace(loadModule(resolved).exports);
        throw new Error(`Cannot find module '${specifier}'`);
      }

      if (specifier.startsWith("#")) {
        const resolved = resolvePackageImportsSync(fromPath, specifier, readSource);
        if (resolved) return toNamespace(loadModule(resolved).exports);
        throw new Error(`Cannot find package import '${specifier}' from '${fromPath}'`);
      }

      const resolved = resolveBareSync(fromPath, specifier, readSource);
      if (resolved) return toNamespace(loadModule(resolved).exports);

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

    type Wrapper = (
      module: unknown,
      exports: unknown,
      require: unknown,
      filename: string,
      dirname: string,
      dwcImport: unknown,
      dwcInteropDefault: unknown,
    ) => void;
    const WRAPPER_PARAMS = ["module", "exports", "require", "__filename", "__dirname", "__dwcImport", "__dwcInteropDefault"];
    const compiled = rewriteDynamicImportCalls(stripShebang(source));

    let wrapper: Wrapper;
    try {
      wrapper = new Function(...WRAPPER_PARAMS, compiled) as Wrapper;
    } catch (originalError) {
      // Not valid CommonJS as-is - on the real files this loader actually
      // hits (chalk@5 and friends: genuinely ESM-only, no CJS build), a
      // best-effort statement rewrite (see esmInterop.ts) usually fixes
      // exactly this. Retried once; if it STILL doesn't compile, the
      // ORIGINAL error is what gets reported (more meaningful than a
      // failure inside our own best-effort transform, and correct for
      // plain-broken-syntax input the transform is a no-op on).
      try {
        wrapper = new Function(...WRAPPER_PARAMS, transformEsmToCjs(compiled)) as Wrapper;
      } catch {
        const message = originalError instanceof Error ? originalError.message : String(originalError);
        throw new Error(`${message} while parsing '${path}'`);
      }
    }
    // `record` itself is passed as `module`, NOT a separate `{ exports:
    // record.exports }` copy - a circular require() (real, confirmed case:
    // pacote's fetcher.js does `module.exports = FetcherBase` THEN
    // `require('./file.js')`, which itself `require('./fetcher.js')`s back)
    // resolves via this SAME cached `record` (loadModule's cache hit above
    // returns it as-is, mid-execution). If guest code does
    // `module.exports = X` (a full reassignment, not a `exports.foo = ...`
    // mutation of the original object), that has to be visible to the
    // circular caller IMMEDIATELY - a separate `moduleObj` copied back to
    // `record` only after `wrapper()` returns would leave the circular
    // caller holding the stale initial `{}` the whole time, exactly the
    // shape of bug real npm's own pacote hit (a base class handed to
    // `class X extends Y` as a plain object instead of the real class).
    const initialExports = record.exports;
    try {
      wrapper(record, initialExports, createRequire(path), path, dirname(path), createDynamicImport(path), interopDefault);
    } catch (error) {
      // Every stack frame `new Function`-compiled code produces is an
      // anonymous "eval at loadModule" line - real Node's own file:line
      // frames don't exist here at all, so a deep require chain's error
      // (npm's own dependency tree routinely runs 10+ requires deep) is
      // otherwise unattributable to any specific file. Tagged once, on the
      // ORIGINATING module only - the same error re-throws up through every
      // enclosing require() on its way out, and re-tagging at each of THOSE
      // levels would misattribute it to the wrong (calling, not failing)
      // file.
      const tagged = error as unknown as Record<symbol, unknown>;
      if (error instanceof Error && !tagged[MODULE_PATH_TAG]) {
        tagged[MODULE_PATH_TAG] = path;
        error.message = `${error.message} (while executing '${path}')`;
      }
      throw error;
    }

    return record;
  };

  // Real, native-semantics ESM support (live bindings, dynamic import(),
  // top-level await, package.json "exports" resolution) for a file
  // positively identified as ESM ahead of time (a .mjs extension, or the
  // nearest package.json has "type": "module") - see esmLoader.ts's own
  // doc comment for the full design. Everything else (the overwhelming
  // common case) stays on the synchronous CJS path above, completely
  // unchanged - only an entry point (or something reached via a static/
  // dynamic import FROM one) actually detected as ESM ever touches this.
  const esmLoader = createEsmLoader({
    readSource,
    requireSync: (fromPath, specifier) => createRequire(fromPath)(specifier),
    resolvePackageImports: (fromPath, specifier) => resolvePackageImportsSync(fromPath, specifier, readSource),
  });

  return {
    createRequire,
    async run(entryPath: string): Promise<unknown> {
      if (esmLoader.isEsmPath(entryPath)) {
        return esmLoader.run(entryPath);
      }
      return loadModule(entryPath).exports;
    },
  };
};

export { createModuleLoader };
export type { ModuleLoaderOptions };
