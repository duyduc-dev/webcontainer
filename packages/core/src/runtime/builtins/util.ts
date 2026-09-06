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

const utilModule = { format, formatWithOptions, inherits, deprecate };

export default utilModule;
export { deprecate, format, formatWithOptions, inherits };
