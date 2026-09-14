/**
 * Minimal, best-effort ESM interop for moduleLoader.ts's CommonJS-only,
 * `new Function`-based loader. Not a general ES module parser — scoped to
 * the concrete syntax patterns real vendored packages actually use (traced
 * against npm@10.9.2's own `chalk`/`supports-color`/`ansi-styles`
 * dependency, all genuinely ESM-only with no CommonJS build, plus real
 * @emnapi/core - a rolldown-vite dependency reached via its own WebContainer
 * WASM fallback, see module.ts's doc comment on process.versions.
 * webcontainer): a plain `export default IDENT;`, `export function/class/
 * const/let/var NAME`, `export { a, b as c } [from '...'];` (including
 * chalk's own multi-line, comment-bearing form), `export * from '...'`, and
 * `import Default`/`import { a, b as c }`/`import * as ns`/`import '...'`
 * from a specifier. Same "best-effort, regex-based" philosophy as
 * preload.ts's REQUIRE_PATTERN scan — an unsupported pattern just means the
 * retry compile in moduleLoader.ts's loadModule() fails the same way it
 * would without this transform at all (the ORIGINAL SyntaxError is what
 * gets reported, not one from here).
 *
 * Matches against the REAL source but only actually rewrites a match whose
 * position is real code, not text sitting inside a string/template/comment/
 * regex literal (esmLoader.ts's own maskNonCode()/isRealCode(), shared here
 * rather than duplicated) - traced need: real @emnapi/core's own source
 * throws `new TypeError("... Use \`import { getDefaultContext } from
 * '@emnapi/runtime'\`")`, a plain error-message STRING that happens to
 * contain real import syntax as advice text. Before this masking was
 * applied here, IMPORT_NAMED_RE matched that text unconditionally and
 * rewrote it into a syntactically broken string literal (found live: `new
 * Function()` then failed with "missing ) after argument list", a
 * different and more confusing error than the original "Cannot use import
 * statement outside a module" this transform exists to fix in the first
 * place).
 */
import { isRealCode, maskNonCode } from "./esmLoader";

/** Wraps a require()d/loadModule()d CJS export into the shape a dynamic
 * `import()` caller expects (a module namespace object): a value this
 * module's own transformEsmToCjs() produced is already namespace-shaped
 * (marked `__esModule`) and passed through as-is; a plain CommonJS export is
 * spread as named exports with `default` added, matching real Node's own
 * CJS-via-ESM interop convention. */
const toNamespace = (exported: unknown): Record<string, unknown> => {
  if (exported && typeof exported === "object" && "__esModule" in exported) {
    return exported as Record<string, unknown>;
  }
  return { ...(typeof exported === "object" && exported !== null ? exported : {}), default: exported };
};

/** The `__dwcInteropDefault` a transformed `import Default from '...'` call
 * site binds through: an already-namespace-shaped value's `default` field,
 * or the plain CJS export itself untouched. */
const interopDefault = (mod: unknown): unknown =>
  mod && typeof mod === "object" && "__esModule" in mod ? (mod as Record<string, unknown>).default : mod;

/** Strips `// ...` line comments so a multi-line `export {...}`/`import
 * {...}` list's commented-out or annotated entries (real example: chalk's
 * own "// TODO: Remove these aliases..." line inside its export list) don't
 * get parsed as part of a name. Only line comments - none of the real
 * source this targets uses block comments inside an import/export list. */
const stripLineComments = (text: string): string => text.replace(/\/\/[^\n]*/g, "");

interface NameAlias {
  name: string;
  alias: string;
}

/** Parses the inside of a `{ a, b as c }` list (export or import) into
 * name/alias pairs, tolerant of the comments/newlines real multi-line lists
 * contain. */
const parseNameList = (inner: string): NameAlias[] => {
  const cleaned = stripLineComments(inner);
  const entries: NameAlias[] = [];
  for (const rawEntry of cleaned.split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const match = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(entry);
    if (!match) continue; // not a plain name/alias entry - skip rather than guess
    entries.push({ name: match[1]!, alias: match[2] ?? match[1]! });
  }
  return entries;
};

// Only the two keywords are matched, never the expression after them: a
// real `export default` is followed by anything from an identifier to a
// multi-line object, class or function literal, and rewriting just the
// keywords into an assignment leaves whatever follows to stand as its own
// expression. Traced need: real yargs' own platform shim opens with
// `export default {` and closes many lines later.
const DEFAULT_EXPORT_RE = /export\s+default\s+/g;
const DECLARATION_EXPORT_RE = /export\s+(async function|function|class|const|let|var)\s+(\w+)/g;
const EXPORT_LIST_RE = /export\s*\{([\s\S]*?)\}\s*(?:from\s*(["'])([^"']+)\2)?\s*;?/g;
const EXPORT_STAR_RE = /export\s*\*\s*from\s*(["'])([^"']+)\1;?/g;
const IMPORT_DEFAULT_RE = /import\s+(\w+)\s+from\s*(["'])([^"']+)\2;?/g;
const IMPORT_NAMED_RE = /import\s*\{([\s\S]*?)\}\s*from\s*(["'])([^"']+)\2;?/g;
const IMPORT_NAMESPACE_RE = /import\s*\*\s*as\s+(\w+)\s+from\s*(["'])([^"']+)\2;?/g;
// `import Default, { a, b } from '...'` and `import Default, * as ns from
// '...'` - the combined forms, which neither the default-only nor the
// named-only pattern matches (the comma breaks both). Traced need: real
// listr2, reached through Angular's own CLI, opens with
// `import EventEmitter, { setMaxListeners } from "node:events";`.
const IMPORT_DEFAULT_AND_NAMED_RE = /import\s+(\w+)\s*,\s*\{([\s\S]*?)\}\s*from\s*(["'])([^"']+)\3;?/g;
const IMPORT_DEFAULT_AND_NAMESPACE_RE = /import\s+(\w+)\s*,\s*\*\s*as\s+(\w+)\s+from\s*(["'])([^"']+)\3;?/g;
const IMPORT_SIDE_EFFECT_RE = /import\s*(["'])([^"']+)\1;?/g;

// The names moduleLoader.ts's `new Function` wrapper passes as parameters.
// A real ESM file is free to declare any of them itself - `const require =
// createRequire(import.meta.url)` is the common one, and perfectly legal
// where there is no outer `require` binding - but the same declaration in
// the wrapper's own scope is a redeclaration SyntaxError, which defeats
// this whole retry. Traced need: real yargs-parser@22, reached through
// Angular's CLI.
const WRAPPER_BINDINGS = ["module", "exports", "require", "__filename", "__dirname", "__dwcImport", "__dwcInteropDefault"];

// Generated code addresses the wrapper's bindings through these aliases,
// never by their own names. Captured before the body, so a module that
// shadows one of them inside the added block scope below shadows it only
// for its OWN code - without this, a rewritten `require(...)` sitting above
// the module's own `const require` reads that declaration's temporal dead
// zone instead of the wrapper's parameter.
const REQUIRE_ALIAS = "__dwcRequireRef";
const EXPORTS_ALIAS = "__dwcExportsRef";
const INTEROP_ALIAS = "__dwcInteropRef";
const FILENAME_ALIAS = "__dwcFilenameRef";
const DIRNAME_ALIAS = "__dwcDirnameRef";
// Only the aliases a given module's own rewrite actually needs are
// emitted - referencing a wrapper binding the caller never passed (the
// unit tests build a deliberately minimal wrapper) would throw before the
// module body ever ran.
const aliasPrologue = (options: { interop: boolean; importMeta: boolean }): string => {
  const parts = [`${REQUIRE_ALIAS} = require`, `${EXPORTS_ALIAS} = exports`];
  if (options.interop) parts.push(`${INTEROP_ALIAS} = __dwcInteropDefault`);
  if (options.importMeta) parts.push(`${FILENAME_ALIAS} = __filename`, `${DIRNAME_ALIAS} = __dirname`);
  return `const ${parts.join(", ")};`;
};
const WRAPPER_BINDING_DECL_RE = new RegExp(`(?:^|[;{}()\\n])\\s*(?:const|let|class)\\s+(?:${WRAPPER_BINDINGS.join("|")})\\b`, "g");

const IMPORT_META_RE = /\bimport\s*\.\s*meta\b/g;
const IMPORT_META_IDENTIFIER = "__dwcImportMeta";
// `url` is required lazily inside each accessor rather than at the top of
// the prologue: a module that merely mentions `import.meta` without ever
// reading it (the common case - one branch of a config loader) should not
// pay for loading a builtin, and `resolve()` needs a fresh `require` call
// anyway to resolve relative to this module.
const IMPORT_META_PROLOGUE = `const ${IMPORT_META_IDENTIFIER} = {
  get url() { return ${REQUIRE_ALIAS}("url").pathToFileURL(${FILENAME_ALIAS}).href; },
  get filename() { return ${FILENAME_ALIAS}; },
  get dirname() { return ${DIRNAME_ALIAS}; },
  resolve: function (specifier) { return ${REQUIRE_ALIAS}("url").pathToFileURL(${REQUIRE_ALIAS}.resolve(specifier)).href; },
};`


/**
 * Best-effort rewrite of top-level ESM `import`/`export` statement syntax
 * into the equivalent CommonJS the surrounding `new Function`-compiled
 * wrapper already provides `require`/`exports`/`module` for. Only ever
 * called as a retry after a plain compile attempt fails with a SyntaxError
 * (see moduleLoader.ts's loadModule()) - never on the fast CommonJS path.
 */
const transformEsmToCjs = (source: string): string => {
  const appends: string[] = [];
  const masked = maskNonCode(source);
  const edits: { start: number; end: number; replacement: string }[] = [];

  // Matches against the real, untouched `source` (every pattern's own
  // capture groups need the real text) but only queues an edit for a match
  // whose start position is real code in the masked text - see this file's
  // own module doc comment for the real bug this guards against (advice
  // text inside an error-message string that happens to read like a real
  // import statement). Every edit is collected by absolute offset into the
  // ORIGINAL string and applied in one left-to-right pass at the end, so
  // patterns never see each other's rewritten output (each match position
  // is independent, unlike the old sequential `.replace()` chain).
  const scan = (re: RegExp, onMatch: (match: RegExpMatchArray) => string): void => {
    for (const match of Array.from(source.matchAll(re))) {
      if (match.index === undefined || !isRealCode(masked, source, match.index)) continue;
      edits.push({ start: match.index, end: match.index + match[0].length, replacement: onMatch(match) });
    }
  };

  scan(DEFAULT_EXPORT_RE, () => `${EXPORTS_ALIAS}.default = `);

  scan(DECLARATION_EXPORT_RE, (match) => {
    const [, keyword, name] = match as unknown as [string, string, string];
    appends.push(`${EXPORTS_ALIAS}.${name} = ${name};`);
    return `${keyword} ${name}`;
  });

  scan(EXPORT_LIST_RE, (match) => {
    const [, inner, , from] = match as unknown as [string, string, string | undefined, string | undefined];
    for (const { name, alias } of parseNameList(inner)) {
      appends.push(
        from !== undefined
          ? `${EXPORTS_ALIAS}.${alias} = ${REQUIRE_ALIAS}(${JSON.stringify(from)}).${name};`
          : `${EXPORTS_ALIAS}.${alias} = ${name};`,
      );
    }
    return "";
  });

  // `export * from '...'` - real semantics: re-export every NAMED export
  // (never `default`) from the target module. Traced need: real
  // @emnapi/core (a rolldown-vite dependency, reached via its own
  // WebContainer WASM fallback) does exactly `export * from
  // '@emnapi/wasi-threads';` at its top level - previously unhandled by
  // this transform entirely, so the retry compile failed the same way the
  // original one did and the real SyntaxError was all that ever surfaced.
  // `require(from)` is called once per re-exported key here rather than
  // hoisted into a local var - simpler codegen, and free in practice since
  // moduleLoader.ts's own require() cache makes every call after the first
  // a cache hit, not a second real load.
  scan(EXPORT_STAR_RE, (match) => {
    const from = match[2]!;
    appends.push(
      `Object.keys(${REQUIRE_ALIAS}(${JSON.stringify(from)})).forEach(function (__dwcReexportKey) { if (__dwcReexportKey !== "default") ${EXPORTS_ALIAS}[__dwcReexportKey] = ${REQUIRE_ALIAS}(${JSON.stringify(from)})[__dwcReexportKey]; });`,
    );
    return "";
  });

  let usesInterop = false;

  scan(IMPORT_DEFAULT_AND_NAMED_RE, (match) => {
    const [, defaultName, inner, , specifier] = match as unknown as [string, string, string, string, string];
    usesInterop = true;
    const bindings = parseNameList(inner)
      .map(({ name, alias }) => `${name}: ${alias}`)
      .join(", ");
    const required = `${REQUIRE_ALIAS}(${JSON.stringify(specifier)})`;
    return `const ${defaultName} = ${INTEROP_ALIAS}(${required}); const { ${bindings} } = ${required};`;
  });

  scan(IMPORT_DEFAULT_AND_NAMESPACE_RE, (match) => {
    const [, defaultName, namespaceName, , specifier] = match as unknown as [string, string, string, string, string];
    usesInterop = true;
    const required = `${REQUIRE_ALIAS}(${JSON.stringify(specifier)})`;
    return `const ${defaultName} = ${INTEROP_ALIAS}(${required}); const ${namespaceName} = ${required};`;
  });

  scan(IMPORT_DEFAULT_RE, (match) => {
    usesInterop = true;
    return `const ${match[1]} = ${INTEROP_ALIAS}(${REQUIRE_ALIAS}(${JSON.stringify(match[3])}));`;
  });

  scan(IMPORT_NAMED_RE, (match) => {
    const [, inner, , specifier] = match as unknown as [string, string, string, string];
    const bindings = parseNameList(inner)
      .map(({ name, alias }) => `${name}: ${alias}`)
      .join(", ");
    return `const { ${bindings} } = ${REQUIRE_ALIAS}(${JSON.stringify(specifier)});`;
  });

  scan(IMPORT_NAMESPACE_RE, (match) => `const ${match[1]} = ${REQUIRE_ALIAS}(${JSON.stringify(match[3])});`);

  scan(IMPORT_SIDE_EFFECT_RE, (match) => `${REQUIRE_ALIAS}(${JSON.stringify(match[2])});`);

  // `import.meta` is a syntax error in anything `new Function` compiles,
  // not just an unsupported statement - so a single mention of it anywhere
  // in the file defeats this whole retry, even on a line that never runs.
  // Traced need: real yargs@18 (reached through Angular's own CLI, which
  // require()s it from CommonJS) has exactly one `import.meta.resolve(...)`
  // call, on its `extends`-config branch. Rewritten to a local stand-in
  // built from the CommonJS bindings the wrapper already provides, so the
  // three members real code actually reaches for keep working.
  let usesImportMeta = false;
  scan(IMPORT_META_RE, () => {
    usesImportMeta = true;
    return IMPORT_META_IDENTIFIER;
  });

  edits.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const edit of edits) {
    out += source.slice(cursor, edit.start) + edit.replacement;
    cursor = edit.end;
  }
  out += source.slice(cursor);

  const prologue = usesImportMeta ? `${IMPORT_META_PROLOGUE}\n` : "";
  const body = `${prologue}${out}\n${appends.join("\n")}`;

  // Only wrapped when the module actually redeclares one of the wrapper's
  // own parameter names: a plain block is enough to turn the redeclaration
  // into ordinary shadowing, and the generated `exports.X = X` lines have
  // to live inside it to still see what the body declared. `var` keeps
  // hoisting out of the block either way, so nothing else moves.
  const needsScope = Array.from(source.matchAll(WRAPPER_BINDING_DECL_RE)).some(
    (match) => match.index !== undefined && isRealCode(masked, source, match.index),
  );

  const aliases = aliasPrologue({ interop: usesInterop, importMeta: usesImportMeta });

  return `${aliases}\nObject.defineProperty(${EXPORTS_ALIAS}, "__esModule", { value: true });\n${needsScope ? `{\n${body}\n}` : body}\n`;
};

export { interopDefault, toNamespace, transformEsmToCjs };
