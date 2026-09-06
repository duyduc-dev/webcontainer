/**
 * Minimal, best-effort ESM interop for moduleLoader.ts's CommonJS-only,
 * `new Function`-based loader. Not a general ES module parser — scoped to
 * the concrete syntax patterns real vendored packages actually use (traced
 * against npm@10.9.2's own `chalk`/`supports-color`/`ansi-styles`
 * dependency, all genuinely ESM-only with no CommonJS build): a plain
 * `export default IDENT;`, `export function/class/const/let/var NAME`,
 * `export { a, b as c } [from '...'];` (including chalk's own multi-line,
 * comment-bearing form), and `import Default`/`import { a, b as c }`/
 * `import * as ns`/`import '...'` from a specifier. Same "best-effort,
 * regex-based" philosophy as preload.ts's REQUIRE_PATTERN scan — an
 * unsupported pattern just means the retry compile in moduleLoader.ts's
 * loadModule() fails the same way it would without this transform at all
 * (the ORIGINAL SyntaxError is what gets reported, not one from here).
 */

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

const DEFAULT_EXPORT_RE = /export\s+default\s+([^;\n]+);/g;
const DECLARATION_EXPORT_RE = /export\s+(async function|function|class|const|let|var)\s+(\w+)/g;
const EXPORT_LIST_RE = /export\s*\{([\s\S]*?)\}\s*(?:from\s*(["'])([^"']+)\2)?\s*;?/g;
const IMPORT_DEFAULT_RE = /import\s+(\w+)\s+from\s*(["'])([^"']+)\2;?/g;
const IMPORT_NAMED_RE = /import\s*\{([\s\S]*?)\}\s*from\s*(["'])([^"']+)\2;?/g;
const IMPORT_NAMESPACE_RE = /import\s*\*\s*as\s+(\w+)\s+from\s*(["'])([^"']+)\2;?/g;
const IMPORT_SIDE_EFFECT_RE = /import\s*(["'])([^"']+)\1;?/g;

/**
 * Best-effort rewrite of top-level ESM `import`/`export` statement syntax
 * into the equivalent CommonJS the surrounding `new Function`-compiled
 * wrapper already provides `require`/`exports`/`module` for. Only ever
 * called as a retry after a plain compile attempt fails with a SyntaxError
 * (see moduleLoader.ts's loadModule()) - never on the fast CommonJS path.
 */
const transformEsmToCjs = (source: string): string => {
  const appends: string[] = [];
  let out = source;

  out = out.replace(DEFAULT_EXPORT_RE, (_match, expr: string) => {
    appends.push(`exports.default = ${expr};`);
    return "";
  });

  out = out.replace(DECLARATION_EXPORT_RE, (_match, keyword: string, name: string) => {
    appends.push(`exports.${name} = ${name};`);
    return `${keyword} ${name}`;
  });

  out = out.replace(EXPORT_LIST_RE, (_match, inner: string, _quote: string | undefined, from: string | undefined) => {
    for (const { name, alias } of parseNameList(inner)) {
      appends.push(from !== undefined ? `exports.${alias} = require(${JSON.stringify(from)}).${name};` : `exports.${alias} = ${name};`);
    }
    return "";
  });

  out = out.replace(
    IMPORT_DEFAULT_RE,
    (_match, name: string, _quote: string, specifier: string) =>
      `const ${name} = __dwcInteropDefault(require(${JSON.stringify(specifier)}));`,
  );

  out = out.replace(IMPORT_NAMED_RE, (_match, inner: string, _quote: string, specifier: string) => {
    const bindings = parseNameList(inner)
      .map(({ name, alias }) => `${name}: ${alias}`)
      .join(", ");
    return `const { ${bindings} } = require(${JSON.stringify(specifier)});`;
  });

  out = out.replace(
    IMPORT_NAMESPACE_RE,
    (_match, name: string, _quote: string, specifier: string) => `const ${name} = require(${JSON.stringify(specifier)});`,
  );

  out = out.replace(IMPORT_SIDE_EFFECT_RE, (_match, _quote: string, specifier: string) => `require(${JSON.stringify(specifier)});`);

  return `Object.defineProperty(exports, "__esModule", { value: true });\n${out}\n${appends.join("\n")}\n`;
};

export { interopDefault, toNamespace, transformEsmToCjs };
