import utilTypesFactory from "../node/internal/util/types";

// Real Node's `require('util').types` is the exact same object
// `require('util/types')`/`require('node:util/types')` returns (already
// vendored at internal/util/types.js, registered as its own top-level
// specifier in node/loader.ts) - traced need: real npm-installed code
// commonly reaches for `require('util').types.isUint8Array(...)` as one
// object property access rather than a separate top-level import, which
// this hand-written `util` builtin never exposed at all (`.types` was
// simply undefined). Invoked directly rather than routed through
// require('util/types') (a second module instance, distinct from require()
// call to reuse it here would need this file to have its own require()
// available, which builtins/util.ts doesn't take as a parameter) - safe
// since its factory body never actually touches its own require/
// internalBinding/process/primordials parameters (confirmed by reading it),
// only real global constructors (Uint8Array, DataView, ...) already
// available in this scope.
const utilTypesModule = { exports: {} as Record<string, (...args: unknown[]) => unknown> };
utilTypesFactory(
  utilTypesModule.exports,
  () => {
    throw new Error("internal/util/types.js unexpectedly called require()");
  },
  utilTypesModule,
  undefined as never,
  () => {
    throw new Error("internal/util/types.js unexpectedly called internalBinding()");
  },
  undefined as never,
);

const inspectValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const format = (...args: unknown[]): string => {
  if (args.length === 0) return "";
  const [first, ...rest] = args;

  if (typeof first !== "string") {
    return [first, ...rest].map(inspectValue).join(" ");
  }

  let argIndex = 0;
  const formatted = first.replace(/%[sdifjoO%]/g, (match) => {
    if (match === "%%") return "%";
    if (argIndex >= rest.length) return match;
    const value = rest[argIndex++];
    switch (match) {
      case "%s":
        return typeof value === "string" ? value : inspectValue(value);
      case "%d":
      case "%i":
        return String(Math.trunc(Number(value)));
      case "%f":
        return String(Number(value));
      case "%j":
        try {
          return JSON.stringify(value);
        } catch {
          return "[Circular]";
        }
      case "%o":
      case "%O":
        return inspectValue(value);
      default:
        return match;
    }
  });

  const leftover = rest.slice(argIndex).map(inspectValue);
  return [formatted, ...leftover].join(" ");
};

// Real Node's util.formatWithOptions(inspectOptions, ...args) is util.format
// with an extra leading options bag controlling how objects get inspected
// (colors, depth, ...) - traced need: real npm's own lib/utils/format.js
// calls this directly. `options` only affects inspection STYLING, never
// correctness, so it's accepted (for API compatibility - a caller
// destructuring it wouldn't get `undefined`) and otherwise ignored, same
// simplification this file's `format()` already makes for %o/%O.
const formatWithOptions = (_options: unknown, ...args: unknown[]): string => format(...args);

const inherits = (ctor: { prototype: object }, superCtor: { prototype: object }): void => {
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: { value: ctor, enumerable: false, writable: true, configurable: true },
  });
};

// Real Node's util.deprecate(fn, msg) wraps fn so the FIRST call prints a
// warning (to process.stderr) before running it, then just runs it normally
// on every later call - traced need: real npm's own `debug` dependency
// wraps its (rarely-called) `destroy()` no-op with this at module load, so
// this only needs to exist and return something callable, not perfectly
// match Node's own warning formatting/dedup-by-code behavior.
const deprecate = (fn: (...args: unknown[]) => unknown, message: string): ((...args: unknown[]) => unknown) => {
  let warned = false;
  return (...args: unknown[]) => {
    if (!warned) {
      warned = true;
      console.error(`DeprecationWarning: ${message}`);
    }
    return fn(...args);
  };
};

// Real Node's util.inspect.custom is the well-known Symbol
// (`Symbol.for('nodejs.util.inspect.custom')` - the exact registered name,
// not a private `Symbol()`, so a caller checking equality against that name
// directly elsewhere in the same dependency tree still matches) a class
// uses as a computed property key to customize its own inspection output -
// traced need: real npm's own @npmcli/arborist defines
// `[util.inspect.custom] () { ... }` on its Edge/Node classes. Nothing in
// this runtime actually CALLS that method (no real console.log/REPL
// inspector wired up to look for it), so only the symbol itself needs to
// exist for the class body to evaluate; `inspect()` itself is a best-effort
// JSON-based fallback, not real Node's full recursive/colorized formatting.
const inspectCustomSymbol = Symbol.for("nodejs.util.inspect.custom");

const inspect = Object.assign(
  (value: unknown): string => {
    try {
      return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
      return String(value);
    }
  },
  { custom: inspectCustomSymbol },
);

// Real Node's util.promisify(original) wraps a Node-style
// (err, ...values) => void callback-taking function into one that returns a
// Promise - traced need: real npm's own read-cmd-shim does
// `promisify(fs.readFile)` at module load, and the same pattern (wrapping a
// builtin's callback form) recurs throughout npm's dependency tree, so this
// is a full, spec-accurate implementation rather than a narrow stand-in:
// `util.promisify.custom` lets a function supply its own promisified form,
// and a callback invoked with more than one non-error value resolves the
// promise with an array of those values (both are real Node.js behavior,
// not this runtime's invention).
const promisifyCustomSymbol = Symbol.for("nodejs.util.promisify.custom");

type Callback = (error: unknown, ...values: unknown[]) => void;

// `original`'s params are typed `any[]`, not `unknown[]`: callers pass
// concrete Node-style functions (e.g. `(path: string, cb) => void`) whose
// parameter types are narrower than `unknown`, and a generic wrapper like
// this has to accept those contravariantly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const promisify = (
  original: ((...args: any[]) => unknown) & { [promisifyCustomSymbol]?: (...args: unknown[]) => unknown },
): ((...args: unknown[]) => Promise<unknown>) => {
  if (typeof original !== "function") {
    throw new TypeError('The "original" argument must be of type function');
  }
  const custom = original[promisifyCustomSymbol];
  if (custom !== undefined) {
    if (typeof custom !== "function") {
      throw new TypeError('The "util.promisify.custom" property must be of type function');
    }
    return custom as (...args: unknown[]) => Promise<unknown>;
  }
  return function promisified(this: unknown, ...args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const callback: Callback = (error, ...values) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(values.length > 1 ? values : values[0]);
      };
      original.call(this, ...args, callback);
    });
  };
};
promisify.custom = promisifyCustomSymbol;

// Real Node's util.styleText(format, text) wraps `text` in the ANSI codes
// for the named style(s) (real Node's own `util.inspect.colors` table) -
// traced need: real Vite's own CLI version-print path calls it directly.
// Real Node skips styling entirely when the target stream isn't a
// color-capable TTY (`options.validateStream`, default true, checked
// against `options.stream`, default `process.stdout`) - this runtime's own
// `process.stdout.isTTY` is always `false` (see worker.ts's
// createWritableStream), so by design this correctly no-ops (returns `text`
// unchanged) exactly like real Node would on any non-TTY stream (a piped
// process, this runtime's own guest processes), not a shortcut specific to
// this runtime.
const STYLE_CODES: Record<string, [number, number]> = {
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  overlined: [53, 55],
  inverse: [7, 27],
  hidden: [8, 28],
  strikethrough: [9, 29],
  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  gray: [90, 39],
  grey: [90, 39],
  redBright: [91, 39],
  greenBright: [92, 39],
  yellowBright: [93, 39],
  blueBright: [94, 39],
  magentaBright: [95, 39],
  cyanBright: [96, 39],
  whiteBright: [97, 39],
  bgBlack: [40, 49],
  bgRed: [41, 49],
  bgGreen: [42, 49],
  bgYellow: [43, 49],
  bgBlue: [44, 49],
  bgMagenta: [45, 49],
  bgCyan: [46, 49],
  bgWhite: [47, 49],
  bgBlackBright: [100, 49],
  bgRedBright: [101, 49],
  bgGreenBright: [102, 49],
  bgYellowBright: [103, 49],
  bgBlueBright: [104, 49],
  bgMagentaBright: [105, 49],
  bgCyanBright: [106, 49],
  bgWhiteBright: [107, 49],
};

interface StyleTextOptions {
  validateStream?: boolean;
  stream?: { isTTY?: boolean };
}

const styleText = (format: string | string[], text: string, options: StyleTextOptions = {}): string => {
  const { validateStream = true, stream = (globalThis as { process?: { stdout?: { isTTY?: boolean } } }).process?.stdout } = options;
  if (validateStream && !stream?.isTTY) return text;

  const formats = Array.isArray(format) ? format : [format];
  let open = "";
  let close = "";
  for (const name of formats) {
    const codes = STYLE_CODES[name];
    if (!codes) throw new TypeError(`The argument 'format' is invalid. Received '${name}'`);
    open += `[${codes[0]}m`;
    close = `[${codes[1]}m${close}`;
  }
  return `${open}${text}${close}`;
};

// Real Node's util.stripVTControlCharacters(str) removes ANSI/VT escape
// sequences (the same codes styleText above produces) from a string -
// traced need: real Vite's own CLI does
// `import { stripVTControlCharacters } from 'node:util'` at its top level.
// The pattern is the well-known "ansi-regex" (sindresorhus/ansi-regex,
// MIT), the same one real Node's own implementation is built on: matches
// both CSI sequences (`ESC [ ... letter`, e.g. styleText's own SGR color
// codes) and OSC sequences terminated by BEL or ST.
const ANSI_ESCAPE_RE = new RegExp(
  "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))",
  "g",
);

const stripVTControlCharacters = (text: string): string => text.replace(ANSI_ESCAPE_RE, "");

// Real Node's util.parseEnv(content) parses a .env-file-shaped string into a
// plain key/value object - traced need: real Vite's own CLI does
// `import { parseEnv } from 'node:util'` at its top level for its own
// --envFile support. Real Node's own docs describe this as intentionally
// dotenv-compatible; this is the well-known dotenv `parse()` algorithm
// (single regex line-scanner: `KEY=VALUE`, `export KEY=VALUE`, or
// `KEY: VALUE`, with single/double/backtick-quoted values, `\n`/`\r`
// escapes unescaped only inside double-quoted values, `#`-prefixed
// comments and blank lines ignored) - not this runtime's own invention.
const ENV_LINE_RE =
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

const parseEnv = (content: string): Record<string, string> => {
  const result: Record<string, string> = {};
  const normalized = content.replace(/\r\n?/g, "\n");
  let match: RegExpExecArray | null;
  ENV_LINE_RE.lastIndex = 0;
  while ((match = ENV_LINE_RE.exec(normalized)) !== null) {
    const key = match[1]!;
    let value = (match[2] ?? "").trim();
    const quote = value[0];
    value = value.replace(/^(['"`])([\s\S]*)\1$/m, "$2");
    if (quote === '"') {
      value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    }
    result[key] = value;
  }
  return result;
};

// Real Node's util.TextEncoder/TextDecoder are literally the same
// constructors as the global ones (`require('util').TextEncoder ===
// TextEncoder`), kept for backward compatibility with code written before
// they became real globals - traced need: react-dom/server's own bundled
// output does `new (require('util').TextEncoder)()` rather than relying on
// the global. Both are real, standard Web APIs already available natively
// in this Worker realm, so this is a passthrough, not an implementation.
const utilModule = {
  format,
  formatWithOptions,
  inherits,
  deprecate,
  inspect,
  promisify,
  styleText,
  stripVTControlCharacters,
  parseEnv,
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
  types: utilTypesModule.exports,
};

export default utilModule;
export { deprecate, format, formatWithOptions, inherits, inspect, promisify, styleText, stripVTControlCharacters, parseEnv };
