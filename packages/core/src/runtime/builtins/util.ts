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

const inherits = (ctor: { prototype: object }, superCtor: { prototype: object }): void => {
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: { value: ctor, enumerable: false, writable: true, configurable: true },
  });
};

const utilModule = { format, inherits };

export default utilModule;
export { format, inherits };
