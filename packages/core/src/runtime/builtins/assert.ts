// Hand-written, not vendored: real Node's lib/assert.js leans on
// internal/util/comparisons (itself built on internalBinding primitives) for
// its deep-equality checks - reimplemented here as a plain, self-contained
// recursive comparison instead. Traced need: several real packages this
// runtime's own npm install path pulls in call `assert()`/`assert.equal()`
// directly at runtime (not just module load) - minizlib's zlib-binding
// guards, tar's own path-reservation/unpack internals, graceful-fs's queue
// bookkeeping, https-proxy-agent.
//
// Known gap: deepEqual/deepStrictEqual compare plain objects/arrays/Date/
// RegExp correctly (with circular-reference support) but not Map/Set/
// TypedArray contents or Symbol-keyed properties - none of the traced call
// sites need those; add them if a real one turns up needing it.
class AssertionError extends Error {
  code = "ERR_ASSERTION";
  actual: unknown;
  expected: unknown;
  operator: string;
  generatedMessage: boolean;

  constructor(options: { message?: string; actual?: unknown; expected?: unknown; operator?: string } = {}) {
    const generatedMessage = options.message === undefined;
    const message = options.message ?? `${describe(options.actual)} ${options.operator ?? "=="} ${describe(options.expected)}`;
    super(message);
    this.name = "AssertionError";
    this.actual = options.actual;
    this.expected = options.expected;
    this.operator = options.operator ?? "";
    this.generatedMessage = generatedMessage;
  }
}

const describe = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const raise = (message: string | Error | undefined, details: { actual?: unknown; expected?: unknown; operator?: string }): never => {
  if (message instanceof Error) throw message;
  throw new AssertionError({ message, ...details });
};

const isObjectLike = (value: unknown): value is Record<PropertyKey, unknown> => typeof value === "object" && value !== null;

const deepEqualImpl = (a: unknown, b: unknown, strict: boolean, seen: WeakMap<object, object>): boolean => {
  if (strict ? Object.is(a, b) : a == b) return true; // eslint-disable-line eqeqeq
  if (!isObjectLike(a) || !isObjectLike(b)) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return a instanceof RegExp && b instanceof RegExp && a.source === b.source && a.flags === b.flags;
  }

  const alreadySeen = seen.get(a);
  if (alreadySeen) return alreadySeen === b;
  seen.set(a, b);

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqualImpl(item, b[i], strict, seen));
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.hasOwn(b, key) && deepEqualImpl(a[key], b[key], strict, seen));
};

const deepEqualCheck = (a: unknown, b: unknown, strict: boolean): boolean => deepEqualImpl(a, b, strict, new WeakMap());

const ok = (value: unknown, message?: string | Error): void => {
  if (!value) raise(message, { actual: value, expected: true, operator: "==" });
};

const fail = (message?: string | Error): never => raise(message ?? "Failed", {});

const equal = (actual: unknown, expected: unknown, message?: string | Error): void => {
  if (!(actual == expected)) raise(message, { actual, expected, operator: "==" }); // eslint-disable-line eqeqeq
};

const notEqual = (actual: unknown, expected: unknown, message?: string | Error): void => {
  if (actual == expected) raise(message, { actual, expected, operator: "!=" }); // eslint-disable-line eqeqeq
};

const strictEqual = (actual: unknown, expected: unknown, message?: string | Error): void => {
  if (!Object.is(actual, expected)) raise(message, { actual, expected, operator: "strictEqual" });
};

const notStrictEqual = (actual: unknown, expected: unknown, message?: string | Error): void => {
  if (Object.is(actual, expected)) raise(message, { actual, expected, operator: "notStrictEqual" });
};

const deepEqual = (actual: unknown, expected: unknown, message?: string | Error): void => {
  if (!deepEqualCheck(actual, expected, false)) raise(message, { actual, expected, operator: "deepEqual" });
};

const notDeepEqual = (actual: unknown, expected: unknown, message?: string | Error): void => {
  if (deepEqualCheck(actual, expected, false)) raise(message, { actual, expected, operator: "notDeepEqual" });
};

const deepStrictEqual = (actual: unknown, expected: unknown, message?: string | Error): void => {
  if (!deepEqualCheck(actual, expected, true)) raise(message, { actual, expected, operator: "deepStrictEqual" });
};

const notDeepStrictEqual = (actual: unknown, expected: unknown, message?: string | Error): void => {
  if (deepEqualCheck(actual, expected, true)) raise(message, { actual, expected, operator: "notDeepStrictEqual" });
};

const ifError = (value: unknown): void => {
  if (value !== null && value !== undefined) {
    throw value instanceof Error ? value : new AssertionError({ message: `ifError got unwanted exception: ${describe(value)}` });
  }
};

const throws = (fn: () => void, message?: string | Error): void => {
  try {
    fn();
  } catch {
    return;
  }
  raise(message ?? "Missing expected exception", {});
};

const doesNotThrow = (fn: () => void, message?: string | Error): void => {
  try {
    fn();
  } catch (error) {
    raise(message ?? `Got unwanted exception: ${error instanceof Error ? error.message : String(error)}`, {});
  }
};

const createAssertModule = () => {
  const assertFn = (value: unknown, message?: string | Error) => ok(value, message);
  return Object.assign(assertFn, {
    ok,
    fail,
    equal,
    notEqual,
    strictEqual,
    notStrictEqual,
    deepEqual,
    notDeepEqual,
    deepStrictEqual,
    notDeepStrictEqual,
    ifError,
    throws,
    doesNotThrow,
    AssertionError,
  });
};

export { createAssertModule };
