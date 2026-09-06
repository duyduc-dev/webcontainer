// Hand-written, not vendored: real Node's lib/url.js wraps an internal
// binding this sandbox has no equivalent for. `URL`/`URLSearchParams` are
// already real, standard globals in a Worker (same object the browser's own
// fetch/fetch(Request) machinery uses) - reused rather than reimplemented.
// `parse`/`format`/`pathToFileURL`/`fileURLToPath` are the legacy pre-WHATWG
// API older ecosystem code still calls directly (traced need: nopt's own
// lib/type-defs.js does `url.parse(val)` to validate a "url"-typed CLI
// option) - approximated on top of the real WHATWG URL, not byte-for-byte
// identical to Node's legacy Url object but correct for the common case of
// "does this string parse, and what are its parts".
const legacyParse = (input: string, parseQueryString = false): Record<string, unknown> => {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    // Not an absolute URL - real Node's legacy parser still returns a
    // best-effort object (protocol/host null, the input as pathname) rather
    // than throwing.
    return {
      protocol: null,
      host: null,
      hostname: null,
      port: null,
      pathname: input,
      path: input,
      search: null,
      query: parseQueryString ? {} : null,
      hash: null,
      href: input,
      auth: null,
    };
  }

  const query = parseQueryString ? Object.fromEntries(parsed.searchParams) : parsed.search.replace(/^\?/, "");

  return {
    protocol: parsed.protocol,
    host: parsed.host,
    hostname: parsed.hostname,
    port: parsed.port || null,
    pathname: parsed.pathname,
    path: `${parsed.pathname}${parsed.search}`,
    search: parsed.search || null,
    query,
    hash: parsed.hash || null,
    href: parsed.href,
    auth: parsed.username ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}` : null,
  };
};

const format = (input: URL | { href?: string }): string => (input instanceof URL ? input.href : (input.href ?? String(input)));

const pathToFileURL = (path: string): URL => new URL(`file://${path}`);

const fileURLToPath = (url: URL | string): string => {
  const parsed = typeof url === "string" ? new URL(url) : url;
  return decodeURIComponent(parsed.pathname);
};

const createUrlModule = () => ({
  URL,
  URLSearchParams,
  parse: legacyParse,
  format,
  pathToFileURL,
  fileURLToPath,
});

export { createUrlModule };
