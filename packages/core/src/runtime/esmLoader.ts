import { dirname, normalize } from "../kernel/fs/path";
import { fileCandidates, nodeModulesDirsFrom, relativeModuleCandidates, resolveExportsMap, splitBareSpecifier } from "./resolveSpecifier";

/**
 * Real, native-semantics ES module support: rather than hand-rolling module
 * linking (live bindings, circular-import ordering, `import.meta`), this
 * delegates to the JS engine's own `import()` by constructing each module as
 * a `data:text/javascript;base64,...` URL with its import specifiers
 * rewritten to point at its dependencies' own data: URLs — the engine does
 * the real parsing/linking/evaluation; this module's job is purely
 * specifier resolution + textual rewriting.
 *
 * `data:` URLs (not `blob:`) specifically: `import()` of a `blob:` URL is
 * browser-only (Node's own module loader rejects the scheme outright), but
 * `data:` URLs work identically in both — verified directly, including
 * correct module-identity/caching (two `import()` calls of the identical
 * data: URL string return the SAME evaluated instance) and correct
 * named+default export linking across nested data: URL imports. This also
 * means the mechanism is directly unit-testable under vitest's plain `node`
 * test environment, no browser-like environment needed.
 *
 * Scope, deliberately: this handles the ESM-to-ESM subgraph natively. A
 * specifier that resolves to a CJS/builtin target (or a genuine ESM import
 * cycle - see buildModule's own comment) is routed through the *existing*
 * CommonJS require() machinery (moduleLoader.ts) instead, via a small
 * synthesized ESM shim built from the REAL, already-evaluated exports
 * object (not static guessing - this is an interpreter, not a bundler, so
 * the actual result is already known once required). `require()` of a
 * genuine ESM-only target, the opposite direction, is NOT changed by this
 * module at all - it stays on moduleLoader.ts's existing best-effort
 * transformEsmToCjs retry, since require() must stay synchronous.
 */

type SourceReader = (path: string) => string | undefined;

interface EsmLoaderOptions {
  readSource: SourceReader;
  /** The exact same require() a CJS caller would get (moduleLoader.ts's
   * createRequire(fromPath) inner function) - reused verbatim for the
   * ESM-importing-CJS/builtin/circular-fallback path so an ESM import sees
   * precisely what a require() of the same specifier would produce. */
  requireSync: (fromPath: string, specifier: string) => unknown;
  /** moduleLoader.ts's own resolvePackageImportsSync - reused so a
   * `#specifier` (package.json "imports") resolves identically whether
   * reached via require() or import(). */
  resolvePackageImports: (fromPath: string, specifier: string) => string | null;
}

interface EsmLoader {
  /** True if `path` should be evaluated as a native ES module rather than
   * CommonJS: a `.mjs` extension, or the nearest ancestor package.json has
   * `"type": "module"`. `.cjs` (and anything with no such package.json)
   * stays CJS. Exported so moduleLoader.ts's entry-point check and this
   * module's own recursive resolution agree on exactly the same rule. */
  isEsmPath(path: string): boolean;
  /** Builds (but does not evaluate) the data: URL for `entryPath` - exposed
   * standalone for diagnostics/testing (e.g. measuring output size without
   * needing a full live evaluation), matching this file's existing
   * precedent of exporting isRealCode/maskNonCode for outside reuse. `run`
   * below is just this plus one `import()`. */
  buildEntryDataUrl(entryPath: string): Promise<string>;
  /** Builds the full data: URL graph for `entryPath` and evaluates it via a
   * real `import()`, returning the resulting module namespace. */
  run(entryPath: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// ESM/CJS detection
// ---------------------------------------------------------------------------

const readPackageJsonType = (path: string, readSource: SourceReader): "module" | "commonjs" | undefined => {
  let dir = dirname(path);
  for (;;) {
    const pkgSource = readSource(dir === "/" ? "/package.json" : `${dir}/package.json`);
    if (pkgSource !== undefined) {
      try {
        const pkg = JSON.parse(pkgSource) as { type?: string };
        return pkg.type === "module" ? "module" : "commonjs";
      } catch {
        return undefined;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

const detectIsEsm = (path: string, readSource: SourceReader): boolean => {
  if (path.endsWith(".mjs")) return true;
  if (path.endsWith(".cjs") || path.endsWith(".json")) return false;
  return readPackageJsonType(path, readSource) === "module";
};

// ---------------------------------------------------------------------------
// Non-code masking (strings/templates/comments/regex literals), so the
// specifier scan below can never be fooled by import/export-looking text
// sitting inside a string, comment, or regex. Traced directly against real
// bugs a sibling project (vivari, same class of hand-written module system)
// hit doing this naively: template-literal interpolations and
// regex-vs-division ambiguity both silently dropped a later real export.
// ---------------------------------------------------------------------------

const maskNonCode = (source: string): string => {
  const out = source.split("");
  let lastSignificant = "";

  const blank = (from: number, to: number): void => {
    for (let j = from; j < to; j++) if (out[j] !== "\n") out[j] = " ";
  };

  // A `/` starts a regex literal unless the last significant token was
  // something a value/expression could follow directly (an identifier,
  // number, `)`, or `]`) - in which case it's division. Best-effort, not a
  // full parser (doesn't track keywords like `return`/`typeof` that also
  // allow a following regex) - sufficient for the "don't desync the rest of
  // the scan" goal this exists for.
  const canStartRegex = (): boolean => !lastSignificant || !/[\w$)\]]/.test(lastSignificant);

  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];

    if (ch === "/" && next === "/") {
      const stop = (() => {
        const end = source.indexOf("\n", i);
        return end === -1 ? source.length : end;
      })();
      blank(i, stop);
      i = stop;
      continue;
    }

    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < source.length && source[j] !== quote) {
        j += source[j] === "\\" ? 2 : 1;
      }
      const stop = Math.min(j + 1, source.length);
      blank(i, stop);
      lastSignificant = quote;
      i = stop;
      continue;
    }

    if (ch === "`") {
      let j = i + 1;
      let exprDepth = 0;
      while (j < source.length) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (exprDepth === 0 && source[j] === "`") {
          j++;
          break;
        }
        if (source[j] === "$" && source[j + 1] === "{") {
          exprDepth++;
          j += 2;
          continue;
        }
        if (exprDepth > 0 && source[j] === "}") {
          exprDepth--;
          j++;
          continue;
        }
        // A quote or nested template inside ${...} - skip it as a balanced
        // unit so its own delimiters don't confuse this template's depth
        // count. Best-effort: one level of nesting handled precisely, a
        // deeper case is not (not a general parser - see this module's own
        // doc comment).
        if (exprDepth > 0 && (source[j] === "'" || source[j] === '"' || source[j] === "`")) {
          const inner = source[j];
          j++;
          while (j < source.length && source[j] !== inner) {
            j += source[j] === "\\" ? 2 : 1;
          }
          j++;
          continue;
        }
        j++;
      }
      blank(i, j);
      lastSignificant = "`";
      i = j;
      continue;
    }

    if (ch === "/" && canStartRegex()) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < source.length && source[j] !== "\n") {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === "[") inClass = true;
        else if (source[j] === "]") inClass = false;
        else if (source[j] === "/" && !inClass) {
          closed = true;
          j++;
          break;
        }
        j++;
      }
      if (closed) {
        while (j < source.length && /[a-z]/i.test(source[j]!)) j++;
        blank(i, j);
        lastSignificant = "/";
        i = j;
        continue;
      }
      // Not a well-formed regex literal - fall through and treat `/` as an
      // ordinary character (division), same as the default case below.
    }

    if (!/\s/.test(ch)) lastSignificant = ch;
    i++;
  }

  return out.join("");
};

/** A regex match found in `source` is real code only if its FIRST character
 * is identical in the masked text - every specifier-scanning regex below
 * starts with a keyword character ("f" of "from", "i" of "import"), which
 * masking always blanks to a space if it actually sat inside a
 * string/comment/regex literal in the original, and always leaves alone
 * otherwise (masking blanks contiguous regions in full, never partially).
 * Deliberately checks only this one character, not the whole match span -
 * the match's OWN quoted specifier is masked-out by design (that's what
 * makes it a string literal to begin with), so comparing the full span
 * against masked text would always report a false negative on every real,
 * legitimate import/export. */
const isRealCode = (masked: string, source: string, start: number): boolean => masked[start] === source[start];

// ---------------------------------------------------------------------------
// Specifier scanning - only the trailing "from '...'" / "import '...'" /
// "import('...')" clause is matched (not the whole statement), so this
// never needs to parse the binding list (`{ a, b as c }`, `* as ns`,
// `Default, { ... }`, ...) at all - only the specifier position/text, which
// is all that needs rewriting. Native import() handles everything else -
// EXCEPT a dynamic `import(...)` whose argument isn't a bare string literal
// (a computed specifier, e.g. `import(someUrl + "?t=" + Date.now())` - real
// Vite's own native config loader does exactly this). DYNAMIC_IMPORT_RE
// below only matches the literal-argument shape; DYNAMIC_IMPORT_OPEN_RE
// (used by the fallback pass in buildModule) catches the rest by finding
// just the `import(` token and then walking forward for the matching `)`
// via findMatchingParen - see its own doc comment for why a second regex
// can't also capture an arbitrary expression directly.
//
// Both `import(...)` regexes use a `(?<!\.)` negative lookbehind - `\b`
// alone matches right after a `.` too (a non-word char), so without it a
// real property/method access named `import` (e.g. real Vite's own
// `ModuleRunner.prototype.import(path)`, called as `this.import(x)`) gets
// mistaken for the dynamic-import keyword. Confirmed live: exactly this
// call site, in real Vite's `module-runner.js`, broke DYNAMIC_IMPORT_OPEN_RE's
// fallback rewrite before this guard existed - `this.import(acceptedPath)`
// isn't a call whose "specifier" makes sense to resolve at all. Mirrors
// moduleLoader.ts's own `rewriteDynamicImportCalls`, which already guards
// its CJS-side equivalent the same way.
// ---------------------------------------------------------------------------

const FROM_CLAUSE_RE = /\bfrom\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1/g;
const SIDE_EFFECT_IMPORT_RE = /\bimport\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1/g;
const DYNAMIC_IMPORT_RE = /(?<!\.)\bimport\s*\(\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1\s*\)/g;
const DYNAMIC_IMPORT_OPEN_RE = /(?<!\.)\bimport\s*\(/g;
const IMPORT_META_URL_RE = /\bimport\.meta\.url\b/g;
const IMPORT_META_MAIN_RE = /\bimport\.meta\.main\b/g;
const IMPORT_META_RESOLVE_RE = /\bimport\.meta\.resolve\s*\(\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1\s*\)/g;

/** Finds the `)` matching the `(` at `masked[openParenIndex]`, scanning the
 * ALREADY-MASKED text (see maskNonCode) so a paren sitting inside a string/
 * comment/regex literal never miscounts depth, while a paren inside a
 * template literal's `${...}` interpolation (left unmasked - real code)
 * correctly does. Returns -1 for an unterminated call (malformed source -
 * the caller leaves it untouched rather than guessing). */
const findMatchingParen = (masked: string, openParenIndex: number): number => {
  let depth = 1;
  for (let j = openParenIndex + 1; j < masked.length; j++) {
    if (masked[j] === "(") depth++;
    else if (masked[j] === ")" && --depth === 0) return j;
  }
  return -1;
};

/** True if the token right after `masked[closeParenIndex]` (skipping
 * whitespace) is `{` - the shape of a method/function DECLARATION's own
 * signature (`import(id) { ... }`), never a valid call expression (a real
 * call's closing paren is never directly followed by a block). Guards
 * DYNAMIC_IMPORT_OPEN_RE's fallback against a class or object-literal
 * method literally named `import` with no preceding `.` for the negative
 * lookbehind above to catch - confirmed live: real Vite's own ModuleRunner
 * class declares exactly `async import(id) { ... }`. */
const isFollowedByBlockBody = (masked: string, closeParenIndex: number): boolean => {
  let j = closeParenIndex + 1;
  while (j < masked.length && /\s/.test(masked[j]!)) j++;
  return masked[j] === "{";
};

interface Edit {
  start: number;
  end: number;
  replacement: string;
}

// ---------------------------------------------------------------------------
// base64 encoding - `btoa` (not Node's `Buffer`, which this project's own
// host runtime code can't rely on inside a real browser Worker) over a
// UTF-8 byte sequence, chunked to stay under String.fromCharCode's
// practical argument-count limit for large files. Verified directly to
// round-trip non-ASCII content correctly.
// ---------------------------------------------------------------------------

const bytesToBase64 = (bytes: Uint8Array): string => {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

const toDataUrl = (source: string): string =>
  `data:text/javascript;charset=utf-8;base64,${bytesToBase64(new TextEncoder().encode(source))}`;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
// A named export can't legally be one of these even though they match
// IDENTIFIER_RE - reserved words aren't valid binding names.
const RESERVED_WORDS = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "enum",
  "export", "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "null",
  "return", "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with", "let",
  "static", "yield", "await",
]);
const isValidExportName = (key: string): boolean => IDENTIFIER_RE.test(key) && !RESERVED_WORDS.has(key);

const createEsmLoader = (options: EsmLoaderOptions): EsmLoader => {
  const { readSource, requireSync, resolvePackageImports } = options;

  const isEsmPath = (path: string): boolean => detectIsEsm(path, readSource);

  // Resolves a specifier to an absolute VFS path considered for the native
  // ESM path - returns null (not a throw) on any miss, letting the caller
  // fall back to the existing require()-based resolution, which is more
  // lenient (auto-appended extensions, "main" field, no "exports" map) and
  // already proven against the real npm dependency tree.
  const tryResolveEsmPath = (fromPath: string, specifier: string): string | null => {
    if (specifier.startsWith(".")) {
      return relativeModuleCandidates(fromPath, specifier).find((candidate) => readSource(candidate) !== undefined) ?? null;
    }
    if (specifier.startsWith("/")) {
      return fileCandidates(specifier).find((candidate) => readSource(candidate) !== undefined) ?? null;
    }
    if (specifier.startsWith("#")) {
      return resolvePackageImports(fromPath, specifier);
    }

    const { packageName, subpath } = splitBareSpecifier(specifier);
    const exportsSubpath = subpath === "" ? "." : `./${subpath}`;

    for (const nodeModulesDir of nodeModulesDirsFrom(fromPath)) {
      const pkgDir = `${nodeModulesDir}/${packageName}`;
      const pkgJsonSource = readSource(`${pkgDir}/package.json`);
      if (pkgJsonSource === undefined) continue;

      let pkgJson: { exports?: unknown; main?: string };
      try {
        pkgJson = JSON.parse(pkgJsonSource) as { exports?: unknown; main?: string };
      } catch {
        continue;
      }

      if (pkgJson.exports !== undefined) {
        const resolved = resolveExportsMap(pkgJson.exports, exportsSubpath);
        if (resolved === null) {
          // A package that HAS an "exports" map but doesn't map this
          // subpath (or maps it to an explicit `null`) blocks it entirely -
          // real Node's ERR_PACKAGE_PATH_NOT_EXPORTED. Thrown, not returned
          // as null, specifically so this doesn't silently fall through to
          // the lenient old CJS-style resolver (which has no "exports"
          // awareness at all and would happily find a same-named file on
          // disk that "exports" deliberately hid).
          throw new Error(`Package subpath '${exportsSubpath}' is not exported from package '${packageName}' (package.json "exports")`);
        }
        const target = normalize(`${pkgDir}/${resolved}`);
        return readSource(target) !== undefined ? target : null;
      }

      if (subpath) {
        const match = fileCandidates(`${pkgDir}/${subpath}`).find((candidate) => readSource(candidate) !== undefined);
        if (match) return match;
        continue;
      }
      const main = pkgJson.main ?? "index.js";
      const match = fileCandidates(normalize(`${pkgDir}/${main}`)).find((candidate) => readSource(candidate) !== undefined);
      if (match) return match;
    }

    return null;
  };

  // dataUrlCache stores the in-flight/settled PROMISE, not the resolved
  // string, and is populated synchronously (before any await - see
  // buildModule) so concurrent/re-entrant builds of the same path share one
  // build rather than racing to redo it independently.
  const dataUrlCache = new Map<string, Promise<string>>();
  const cjsShimCache = new Map<string, string>();
  // Snapshot shims for genuine ESM->ESM static edges (see buildEsmShim) -
  // keyed by target path only (unlike cjsShimCache's `fromPath specifier`
  // key), since a real module namespace's shim content doesn't depend on
  // which module is importing it.
  const esmShimCache = new Map<string, string>();
  let entryPath = "";
  let shimSlotCounter = 0;
  // Real evaluated CJS/builtin exports values, keyed by an id embedded in
  // each generated shim module - a data: URL is pure text, so a shim can't
  // carry a real object/function/class reference (which can't be
  // serialized into source) any way other than reading it back off a
  // shared global at evaluation time. `globalThis` is genuinely shared
  // between this code and every data:-URL module `import()` evaluates in
  // this same realm (they're not sandboxed - same Worker, same JS agent).
  const globalShims = ((globalThis as Record<string, unknown>).__dwcCjsShims ??= {}) as Record<string, unknown>;
  // Slot IDs are unique WITHIN one createEsmLoader() instance, but
  // globalShims itself is a single shared globalThis object - safe in
  // production (at most one createEsmLoader() call per real Worker), but
  // NOT across multiple createEsmLoader() calls sharing one JS realm, which
  // is exactly what a test suite does across test cases. A short
  // per-instance prefix keeps every instance's slot IDs disjoint.
  const instancePrefix = `${Math.random().toString(36).slice(2, 8)}_`;

  /** Real Vite's own native config loader (a computed dynamic import - see
   * DYNAMIC_IMPORT_OPEN_RE above) does `import(pathToFileURL(path).href +
   * "?t=" + Date.now())` - a `file://` URL with a cache-busting query, not a
   * shape any branch of tryResolveEsmPath understands on its own. Real
   * Node's own resolver strips exactly this (module identity is by path, not
   * URL+query) before ever touching the filesystem. Only touches a
   * `file://`-prefixed specifier - a bare/relative specifier is never
   * touched here, even one containing a literal "?" (vanishingly rare, and
   * guessing at it isn't this helper's job). */
  const normalizeFileUrlSpecifier = (specifier: string): string => {
    if (!specifier.startsWith("file://")) return specifier;
    let path = specifier.slice("file://".length);
    const hashIndex = path.indexOf("#");
    if (hashIndex !== -1) path = path.slice(0, hashIndex);
    const queryIndex = path.indexOf("?");
    if (queryIndex !== -1) path = path.slice(0, queryIndex);
    return path;
  };

  /** Resolves `specifier` (as imported from `fromPath`) to a data: URL for
   * the LAZY dynamic-import path only (see `__dwcDynamicImport` below) -
   * a genuine ESM target gets its own full, recursively-inlined data: URL
   * here (not the snapshot-shim treatment resolveStaticEdge gives static
   * edges), since a dynamic import target is evaluated standalone, not
   * spliced as literal text into a parent's own source - no duplication
   * risk to avoid. Falls back to the same synthesized CJS shim as every
   * other non-ESM/cyclic edge in this file. */
  // No cycle-guard here, deliberately: a dynamic import() is always a fresh
  // linking root (it never participates in the SAME synchronous linking
  // cycle a static edge would - that's structurally true of real ESM too,
  // not just this loader's own approximation of it), so it never needs to
  // fall back to a snapshot shim just because its target happens to be
  // mid-build for some unrelated reason (e.g. a concurrent sibling dynamic
  // import elsewhere reaching the same shared dependency - see
  // resolveStaticEdge's own doc comment for why THAT case needs real
  // ancestry-chain tracking instead of a flat "is anyone building this"
  // check). buildModule's own promise-memoized dataUrlCache already makes
  // "await something already in flight" safe and correct on its own.
  const resolveAndQueue = async (fromPath: string, rawSpecifier: string): Promise<string> => {
    const specifier = normalizeFileUrlSpecifier(rawSpecifier);
    const target = tryResolveEsmPath(fromPath, specifier);
    if (target && isEsmPath(target)) {
      return buildModule(target, new Set());
    }
    return buildCjsShim(fromPath, specifier);
  };

  // Real dynamic `import(x)` is a Promise-returning, deferred operation -
  // the specifier isn't even looked at until the call actually executes
  // (that's the whole point of using it over a static import: an
  // optional/conditional dependency that may not be installed, like real
  // Vite's own `esbuild ||= import("esbuild")` for its optional esbuild
  // peer dep, must not break module EVALUATION just because it's textually
  // present). So unlike the static-import scans below, a matched
  // `import("x")` call site is rewritten to a call to this shared global
  // resolver instead of being resolved during the scan - resolution (and
  // any "Cannot find module" throw) happens lazily, inside this `async`
  // function, at the moment the rewritten call actually runs, which turns
  // a would-be synchronous crash into a properly-deferred rejected Promise
  // (exactly what real `import()` does for a missing/broken target).
  // Assigned unconditionally (not `??=`) on every createEsmLoader() call so
  // the global always points at the live instance's own caches/closures -
  // there's exactly one esmLoader per process (see moduleLoader.ts).
  (globalThis as Record<string, unknown>).__dwcDynamicImport = async (fromPath: string, specifier: string): Promise<unknown> => {
    const dataUrl = await resolveAndQueue(fromPath, specifier);
    return import(/* @vite-ignore */ dataUrl);
  };

  /** Shared by buildCjsShim and buildEsmShim - given a value already
   * stashed at globalThis.__dwcCjsShims[slotId], renders the `export
   * default ...`/`export const KEY = ...` lines that read it back. Bracket
   * notation (not `.${slotId}`) for the slot lookup deliberately - slotId
   * embeds a random per-instance prefix (see instancePrefix) that can start
   * with a digit, which is not a valid property name for dot notation
   * (`globalThis.__dwcCjsShims.51i02g_s0` is a SyntaxError; confirmed live -
   * the exact, intermittent bug this bracket-notation form fixes). */
  const renderShimLines = (slotId: string, namedKeys: string[], defaultExpr: string): string[] => [
    `export default ${defaultExpr};`,
    ...namedKeys.map((key) => `export const ${key} = globalThis.__dwcCjsShims[${JSON.stringify(slotId)}][${JSON.stringify(key)}];`),
  ];

  /** Runs `specifier` through the exact same require() a CJS caller would
   * get, and wraps the real result as a small ESM shim module - used both
   * for genuine CJS/builtin imports AND as the fallback for a circular ESM
   * reference (see buildModule's own comment on why a pure data: URL can't
   * represent a true cycle). Checks `__esModule && 'default' in exports`
   * (not just `__esModule`) before treating a value as already
   * namespace-shaped - some real compiled-CJS output stamps `__esModule`
   * without actually setting a `default` key. */
  const buildCjsShim = (fromPath: string, specifier: string): string => {
    const cacheKey = `${fromPath} ${specifier}`;
    const cached = cjsShimCache.get(cacheKey);
    if (cached) return cached;

    const exported = requireSync(fromPath, specifier);
    // A function counts too, not just a plain object - `module.exports =
    // someFunction` with extra properties attached (`module.exports.helper
    // = ...`) is a routine real CJS shape (real npm's own left-pad among
    // them), and Object.keys()/property access both work identically on a
    // function object.
    const isExportsLike = exported !== null && (typeof exported === "object" || typeof exported === "function");
    const isNamespaceShaped = isExportsLike && "__esModule" in exported! && "default" in (exported as Record<string, unknown>);
    const namedKeys = isExportsLike
      ? Object.keys(exported as Record<string, unknown>).filter((key) => key !== "default" && isValidExportName(key))
      : [];

    const slotId = `${instancePrefix}s${shimSlotCounter++}`;
    globalShims[slotId] = exported;
    const slotExpr = `globalThis.__dwcCjsShims[${JSON.stringify(slotId)}]`;
    const defaultExpr = isNamespaceShaped ? `${slotExpr}.default` : slotExpr;
    const lines = renderShimLines(slotId, namedKeys, defaultExpr);

    const dataUrl = toDataUrl(lines.join("\n"));
    cjsShimCache.set(cacheKey, dataUrl);
    return dataUrl;
  };

  /** Snapshot shim for a genuine ESM->ESM static edge - see this file's own
   * top-of-file doc comment for why every static edge, not just
   * CJS/builtin/circular ones, goes through this now: splicing a
   * dependency's OWN full (already-inlined) data: URL directly into every
   * importer duplicates it once per importer, compounding exponentially
   * with graph depth/reuse (confirmed live against a real Vite 8/rolldown
   * scaffold - a 65MB+ stack trace before this fix). `namespace` is a REAL,
   * already-evaluated ES module namespace object (from a real `import()`),
   * so - unlike buildCjsShim - no `__esModule`-shape guessing is needed:
   * its own keys ARE its real named exports, exactly.
   *
   * Accepted tradeoff (same one buildCjsShim already makes for CJS/circular
   * edges, now widened to every ESM edge): this is a snapshot taken once,
   * at generation time, not a live binding - a `let`/`var` export
   * REASSIGNED after initial evaluation is not observed by importers.
   * Mutating an exported object/function/class's own contents remains
   * genuinely shared (the snapshot holds a reference, not a deep copy).
   * Checked directly against real code motivating this fix: zero `export
   * let` occurrences anywhere in vendored vite@8/rolldown's own dist/. */
  const buildEsmShim = (namespace: Record<string, unknown>): string => {
    const namedKeys = Object.keys(namespace).filter((key) => key !== "default" && isValidExportName(key));
    const slotId = `${instancePrefix}s${shimSlotCounter++}`;
    globalShims[slotId] = namespace;
    const hasDefault = "default" in namespace;
    const defaultExpr = hasDefault ? `globalThis.__dwcCjsShims[${JSON.stringify(slotId)}].default` : "undefined";
    const lines = renderShimLines(slotId, namedKeys, defaultExpr);
    return toDataUrl(lines.join("\n"));
  };

  /** Resolves a STATIC import edge (see buildModule's FROM_CLAUSE_RE/
   * SIDE_EFFECT_IMPORT_RE scans) - a genuine, non-cyclic ESM target is
   * built, actually evaluated via a real `import()`, and replaced by a
   * tiny snapshot shim (buildEsmShim) instead of its own full inlined
   * content - see buildEsmShim's own doc comment for why. Everything else
   * (CJS/builtin, or a cyclic back-edge) falls through to the unchanged
   * buildCjsShim, exactly as before this fix.
   *
   * `chain` is the set of paths currently on THIS SPECIFIC build's own
   * ancestry (entry -> ... -> fromPath), not a global "is anyone, anywhere,
   * building this" flag - now that buildModule is genuinely async, two
   * UNRELATED builds (e.g. two concurrent dynamic imports that both happen
   * to reach the same shared static dependency) can legitimately have that
   * dependency "in flight" at the same time without being a real cycle at
   * all; a flat global check would wrongly treat that benign, concurrent
   * sharing as a cycle and needlessly fall back to the CJS shim path
   * (confirmed live - exactly the bug a concurrent-dynamic-import test
   * caught). `chain.has(target)` correctly answers "would awaiting this
   * deadlock MY OWN call chain" - the only case that actually needs the
   * fallback. */
  const resolveStaticEdge = async (fromPath: string, rawSpecifier: string, chain: ReadonlySet<string>): Promise<string> => {
    const specifier = normalizeFileUrlSpecifier(rawSpecifier);
    const target = tryResolveEsmPath(fromPath, specifier);
    if (target && isEsmPath(target) && !chain.has(target)) {
      const cachedShim = esmShimCache.get(target);
      if (cachedShim) return cachedShim;
      const targetUrl = await buildModule(target, chain);
      const namespace = (await import(/* @vite-ignore */ targetUrl)) as Record<string, unknown>;
      const shim = buildEsmShim(namespace);
      esmShimCache.set(target, shim);
      return shim;
    }
    return buildCjsShim(fromPath, specifier);
  };

  /** Recursively builds the data: URL for `path`, post-order (dependencies
   * before the module that imports them, since a data: URL IS a hash of
   * its own final content). A genuine ESM import cycle (A imports B, B
   * imports A) can't be represented this way - there's no way to
   * "forward-reference" not-yet-finalized content the way the browser's
   * own parse-then-link-then-evaluate algorithm can for a real cycle. When
   * `target` is already in `chain` (a back-edge into an ANCESTOR of this
   * specific build - see resolveStaticEdge's own doc comment for why this
   * must be per-call ancestry, not a global flag), that ONE edge falls back
   * to buildCjsShim instead - the exact same mechanism real Node's own CJS
   * circular require() already uses correctly elsewhere in this loader (a
   * partial/in-progress exports object, not a hang), just reused here for
   * a circular ESM edge. This is a deliberate, documented limitation, not
   * an oversight: genuine ESM import cycles are rare in practice (most
   * real circular-import code in the wild is CJS).
   *
   * `chain` defaults to empty (a fresh top-level entry, or a dynamic
   * import's own fresh linking root - see resolveAndQueue) and grows by
   * exactly `path` for everything reached from HERE, so a sibling branch of
   * the graph (not an ancestor of this one) never sees it and can build the
   * same shared dependency concurrently without being mistaken for a
   * cycle. */
  const buildModule = (path: string, chain: ReadonlySet<string> = new Set()): Promise<string> => {
    const cached = dataUrlCache.get(path);
    if (cached) return cached;

    const nextChain = new Set(chain);
    nextChain.add(path);

    // A synchronous outer function wrapping an async IIFE: the promise is
    // cached (below) before the IIFE's body ever reaches an `await`, so a
    // concurrent/re-entrant call for the SAME path (possible now that
    // static edges do real `await import()` round-trips - see
    // resolveStaticEdge) shares this one in-flight build instead of
    // redoing it independently.
    const promise = (async (): Promise<string> => {
      const source = readSource(path);
      if (source === undefined) throw new Error(`Cannot find module '${path}'`);
      const masked = maskNonCode(source);
      const fileUrl = `file://${path}`;
      const edits: Edit[] = [];

      // `matchAll` (not a manual `.exec()` loop): per spec it clones the
      // regex internally rather than mutating the shared module-level
      // constant's own `lastIndex` - `onMatch` below recursively calls
      // buildModule() -> scan() again for a DIFFERENT module (now via a
      // real `await`, not just reentrancy - the same reasoning applies,
      // more so), and a manual exec loop sharing the same regex object's
      // `lastIndex` across that reentrant call would silently corrupt the
      // OUTER loop's iteration position once the inner call returns.
      // Collected into an array up front so the loop itself is also
      // fully decoupled from anything the callback does.
      const scan = async (re: RegExp, onMatch: (match: RegExpMatchArray) => void | Promise<void>): Promise<void> => {
        for (const match of Array.from(source.matchAll(re))) {
          if (match.index !== undefined && isRealCode(masked, source, match.index)) await onMatch(match);
        }
      };

      await scan(FROM_CLAUSE_RE, async (match) => {
        const full = match[0];
        const quote = match[1]!;
        const specifier = match[2]!;
        const dataUrl = await resolveStaticEdge(path, specifier, nextChain);
        // full = "from" + whitespace + quote + specifier + quote - the
        // quoted region is always exactly its last (specifier.length + 2)
        // characters.
        const quoteStart = match.index! + full.length - (specifier.length + 2);
        edits.push({ start: quoteStart, end: quoteStart + specifier.length + 2, replacement: `${quote}${dataUrl}${quote}` });
      });

      await scan(SIDE_EFFECT_IMPORT_RE, async (match) => {
        const full = match[0];
        const quote = match[1]!;
        const specifier = match[2]!;
        const dataUrl = await resolveStaticEdge(path, specifier, nextChain);
        edits.push({ start: match.index!, end: match.index! + full.length, replacement: `import ${quote}${dataUrl}${quote}` });
      });

      const literalDynamicImportStarts = new Set<number>();
      await scan(DYNAMIC_IMPORT_RE, (match) => {
        const full = match[0];
        const specifier = match[2]!;
        literalDynamicImportStarts.add(match.index!);
        // Deferred - see `__dwcDynamicImport`'s own doc comment above.
        edits.push({
          start: match.index!,
          end: match.index! + full.length,
          replacement: `globalThis.__dwcDynamicImport(${JSON.stringify(path)}, ${JSON.stringify(specifier)})`,
        });
      });

      // Fallback for a dynamic import() whose argument ISN'T a bare string
      // literal (skipped by DYNAMIC_IMPORT_RE above, tracked via
      // literalDynamicImportStarts so this never double-edits the same call).
      // The specifier here is a computed expression - can't be known until
      // the call actually runs, so instead of JSON-stringifying a value, the
      // ORIGINAL expression text is spliced straight into the replacement
      // (still evaluated at the original call site, just as an argument to
      // __dwcDynamicImport instead of to native import()).
      await scan(DYNAMIC_IMPORT_OPEN_RE, (match) => {
        const start = match.index!;
        if (literalDynamicImportStarts.has(start)) return;
        const openParenIndex = start + match[0].length - 1;
        const closeParenIndex = findMatchingParen(masked, openParenIndex);
        if (closeParenIndex === -1) return; // malformed - leave untouched
        if (isFollowedByBlockBody(masked, closeParenIndex)) return; // a method/function declaration named "import", not a call
        const expr = source.slice(openParenIndex + 1, closeParenIndex);
        edits.push({
          start,
          end: closeParenIndex + 1,
          replacement: `globalThis.__dwcDynamicImport(${JSON.stringify(path)}, (${expr}))`,
        });
      });

      await scan(IMPORT_META_URL_RE, (match) => {
        edits.push({ start: match.index!, end: match.index! + match[0].length, replacement: JSON.stringify(fileUrl) });
      });

      await scan(IMPORT_META_MAIN_RE, (match) => {
        edits.push({ start: match.index!, end: match.index! + match[0].length, replacement: String(path === entryPath) });
      });

      await scan(IMPORT_META_RESOLVE_RE, (match) => {
        const full = match[0];
        const specifier = match[2]!;
        const target = tryResolveEsmPath(path, specifier);
        const resolvedUrl = target ? `file://${target}` : fileUrl;
        edits.push({ start: match.index!, end: match.index! + full.length, replacement: JSON.stringify(resolvedUrl) });
      });

      edits.sort((a, b) => b.start - a.start);
      let rewritten = source;
      for (const edit of edits) {
        rewritten = rewritten.slice(0, edit.start) + edit.replacement + rewritten.slice(edit.end);
      }

      return toDataUrl(rewritten);
    })();

    dataUrlCache.set(path, promise);
    return promise;
  };

  return {
    isEsmPath,
    buildEntryDataUrl(entry: string): Promise<string> {
      entryPath = entry;
      return buildModule(entry);
    },
    async run(entry: string): Promise<unknown> {
      entryPath = entry;
      const dataUrl = await buildModule(entry);
      return import(/* @vite-ignore */ dataUrl);
    },
  };
};

export { createEsmLoader, isRealCode, maskNonCode };
export type { EsmLoader, EsmLoaderOptions };
