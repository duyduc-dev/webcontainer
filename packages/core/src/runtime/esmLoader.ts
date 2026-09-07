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
// is all that needs rewriting. Native import() handles everything else.
// ---------------------------------------------------------------------------

const FROM_CLAUSE_RE = /\bfrom\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1/g;
const SIDE_EFFECT_IMPORT_RE = /\bimport\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1\s*\)/g;
const IMPORT_META_URL_RE = /\bimport\.meta\.url\b/g;
const IMPORT_META_MAIN_RE = /\bimport\.meta\.main\b/g;
const IMPORT_META_RESOLVE_RE = /\bimport\.meta\.resolve\s*\(\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1\s*\)/g;

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

  const dataUrlCache = new Map<string, string>();
  const cjsShimCache = new Map<string, string>();
  const building = new Set<string>();
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

  /** Resolves `specifier` (as imported from `fromPath`) to a data: URL,
   * either by recursing into the native ESM subgraph or falling back to a
   * synthesized CJS shim - shared by both the eager static-import scan
   * below and the lazy dynamic-import path (see `__dwcDynamicImport`). */
  const resolveAndQueue = (fromPath: string, specifier: string): string => {
    const target = tryResolveEsmPath(fromPath, specifier);
    if (target && isEsmPath(target) && !building.has(target)) {
      return buildModule(target);
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
    const dataUrl = resolveAndQueue(fromPath, specifier);
    return import(/* @vite-ignore */ dataUrl);
  };

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
    const defaultValue = isNamespaceShaped ? (exported as Record<string, unknown>).default : exported;
    const namedKeys = isExportsLike
      ? Object.keys(exported as Record<string, unknown>).filter((key) => key !== "default" && isValidExportName(key))
      : [];

    const slotId = `s${shimSlotCounter++}`;
    globalShims[slotId] = exported;
    const defaultExpr = isNamespaceShaped ? `globalThis.__dwcCjsShims.${slotId}.default` : `globalThis.__dwcCjsShims.${slotId}`;
    const lines = [`export default ${defaultExpr};`, ...namedKeys.map((key) => `export const ${key} = globalThis.__dwcCjsShims.${slotId}[${JSON.stringify(key)}];`)];
    void defaultValue; // captured via slotId above, not re-embedded textually

    const dataUrl = toDataUrl(lines.join("\n"));
    cjsShimCache.set(cacheKey, dataUrl);
    return dataUrl;
  };

  /** Recursively builds the data: URL for `path`, post-order (dependencies
   * before the module that imports them, since a data: URL IS a hash of
   * its own final content). A genuine ESM import cycle (A imports B, B
   * imports A) can't be represented this way - there's no way to
   * "forward-reference" not-yet-finalized content the way the browser's
   * own parse-then-link-then-evaluate algorithm can for a real cycle. When
   * `building.has(target)` is true (a back-edge into a module currently
   * being built), that ONE edge falls back to buildCjsShim instead - the
   * exact same mechanism real Node's own CJS circular require() already
   * uses correctly elsewhere in this loader (a partial/in-progress exports
   * object, not a hang), just reused here for a circular ESM edge. This is
   * a deliberate, documented limitation, not an oversight: genuine ESM
   * import cycles are rare in practice (most real circular-import code in
   * the wild is CJS). */
  const buildModule = (path: string): string => {
    const cached = dataUrlCache.get(path);
    if (cached) return cached;

    building.add(path);
    try {
      const source = readSource(path);
      if (source === undefined) throw new Error(`Cannot find module '${path}'`);
      const masked = maskNonCode(source);
      const fileUrl = `file://${path}`;
      const edits: Edit[] = [];

      // `matchAll` (not a manual `.exec()` loop): per spec it clones the
      // regex internally rather than mutating the shared module-level
      // constant's own `lastIndex` - `onMatch` below recursively calls
      // buildModule() -> scan() again for a DIFFERENT module, and a
      // manual exec loop sharing the same regex object's `lastIndex`
      // across that reentrant call would silently corrupt the OUTER
      // loop's iteration position once the inner call returns. Collected
      // into an array up front so the loop itself is also fully decoupled
      // from anything the callback does.
      const scan = (re: RegExp, onMatch: (match: RegExpMatchArray) => void): void => {
        for (const match of Array.from(source.matchAll(re))) {
          if (match.index !== undefined && isRealCode(masked, source, match.index)) onMatch(match);
        }
      };

      scan(FROM_CLAUSE_RE, (match) => {
        const full = match[0];
        const quote = match[1]!;
        const specifier = match[2]!;
        const dataUrl = resolveAndQueue(path, specifier);
        // full = "from" + whitespace + quote + specifier + quote - the
        // quoted region is always exactly its last (specifier.length + 2)
        // characters.
        const quoteStart = match.index! + full.length - (specifier.length + 2);
        edits.push({ start: quoteStart, end: quoteStart + specifier.length + 2, replacement: `${quote}${dataUrl}${quote}` });
      });

      scan(SIDE_EFFECT_IMPORT_RE, (match) => {
        const full = match[0];
        const quote = match[1]!;
        const specifier = match[2]!;
        const dataUrl = resolveAndQueue(path, specifier);
        edits.push({ start: match.index!, end: match.index! + full.length, replacement: `import ${quote}${dataUrl}${quote}` });
      });

      scan(DYNAMIC_IMPORT_RE, (match) => {
        const full = match[0];
        const specifier = match[2]!;
        // Deferred - see `__dwcDynamicImport`'s own doc comment above.
        edits.push({
          start: match.index!,
          end: match.index! + full.length,
          replacement: `globalThis.__dwcDynamicImport(${JSON.stringify(path)}, ${JSON.stringify(specifier)})`,
        });
      });

      scan(IMPORT_META_URL_RE, (match) => {
        edits.push({ start: match.index!, end: match.index! + match[0].length, replacement: JSON.stringify(fileUrl) });
      });

      scan(IMPORT_META_MAIN_RE, (match) => {
        edits.push({ start: match.index!, end: match.index! + match[0].length, replacement: String(path === entryPath) });
      });

      scan(IMPORT_META_RESOLVE_RE, (match) => {
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

      const dataUrl = toDataUrl(rewritten);
      dataUrlCache.set(path, dataUrl);
      return dataUrl;
    } finally {
      building.delete(path);
    }
  };

  return {
    isEsmPath,
    async run(entry: string): Promise<unknown> {
      entryPath = entry;
      const dataUrl = buildModule(entry);
      return import(/* @vite-ignore */ dataUrl);
    },
  };
};

export { createEsmLoader };
export type { EsmLoader, EsmLoaderOptions };
