// Hand-written, not vendored: real Node's lib/querystring.js is small and
// self-contained (no internalBinding), reimplemented directly rather than
// vendored. Predates URLSearchParams and still `require()`d directly by
// older ecosystem code (traced need: @npmcli/config's own
// lib/definitions/definitions.js calls `querystring.parse`) - unlike
// URLSearchParams, a repeated key becomes an array, which is why this isn't
// just `Object.fromEntries(new URLSearchParams(str))`.
type ParsedQuery = Record<string, string | string[]>;

const tryDecode = (value: string): string => {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
};

const parse = (input: string, sep = "&", eq = "="): ParsedQuery => {
  const result: ParsedQuery = {};
  if (!input) return result;

  for (const pair of input.split(sep)) {
    if (!pair) continue;
    const eqIndex = pair.indexOf(eq);
    const rawKey = eqIndex === -1 ? pair : pair.slice(0, eqIndex);
    const rawValue = eqIndex === -1 ? "" : pair.slice(eqIndex + eq.length);
    const key = tryDecode(rawKey);
    const value = tryDecode(rawValue);

    const existing = result[key];
    if (existing === undefined) result[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else result[key] = [existing, value];
  }

  return result;
};

const stringify = (obj: Record<string, unknown>, sep = "&", eq = "="): string => {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj ?? {})) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      parts.push(`${encodeURIComponent(key)}${eq}${encodeURIComponent(String(v))}`);
    }
  }
  return parts.join(sep);
};

const createQuerystringModule = () => ({
  parse,
  decode: parse,
  stringify,
  encode: stringify,
  escape: encodeURIComponent,
  unescape: decodeURIComponent,
});

export { createQuerystringModule };
