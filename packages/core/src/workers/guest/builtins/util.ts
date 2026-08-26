// A deliberately small `util` subset — inherits/format/promisify cover what
// most packages actually touch at require() time. Full Node `util` (inspect
// options, deprecate, callbackify, TextEncoder re-exports, etc.) is out of
// scope for now.

function inherits(ctor: { prototype: object; super_?: unknown }, superCtor: { prototype: object }): void {
  ctor.super_ = superCtor;
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}

function inspect(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function format(...args: unknown[]): string {
  if (typeof args[0] !== "string") {
    return args.map((arg) => inspect(arg)).join(" ");
  }

  const template = args[0];
  let i = 1;
  const formatted = template.replace(/%[sdifjoO%]/g, (match) => {
    if (match === "%%") return "%";
    if (i >= args.length) return match;
    const arg = args[i++];
    switch (match) {
      case "%s":
        return typeof arg === "string" ? arg : inspect(arg);
      case "%d":
        return String(Number(arg));
      case "%i":
        return String(parseInt(String(arg), 10));
      case "%f":
        return String(parseFloat(String(arg)));
      case "%j":
        try {
          return JSON.stringify(arg);
        } catch {
          return "[Circular]";
        }
      case "%o":
      case "%O":
        return inspect(arg);
      default:
        return match;
    }
  });

  const rest = args.slice(i).map((arg) => inspect(arg));
  return [formatted, ...rest].join(" ");
}

type NodeStyleCallback = (err: unknown, result?: unknown) => void;
type NodeStyleFn = (...args: [...unknown[], NodeStyleCallback]) => void;

function promisify(fn: NodeStyleFn): (...args: unknown[]) => Promise<unknown> {
  return (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      fn(...args, ((err: unknown, result?: unknown) => {
        if (err) reject(err);
        else resolve(result);
      }) as NodeStyleCallback);
    });
}

export default { inherits, format, inspect, promisify, types: {} };
