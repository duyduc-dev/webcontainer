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

const utilModule = { format, formatWithOptions, inherits, deprecate, inspect, promisify };

export default utilModule;
export { deprecate, format, formatWithOptions, inherits, inspect, promisify };
