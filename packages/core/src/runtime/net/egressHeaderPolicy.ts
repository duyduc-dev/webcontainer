// Which outbound request headers survive the browser's CORS rules.
//
// A cross-origin request carrying ONLY the four CORS-safelisted headers is a
// "simple" request the browser sends without a preflight OPTIONS. Anything else
// — `authorization`, `range`, `x-amz-*`, npm's `npm-session`/`pacote-*` — makes
// the browser ask permission first, and a target that does not answer that
// preflight with a matching `Access-Control-Allow-Headers` gets the whole
// request blocked.
//
// `registry.npmjs.org` is exactly such a target: it returns
// `Access-Control-Allow-Origin: *` on the actual GET but does not answer the
// preflight. None of npm's custom headers are needed to fetch a public packument
// or tarball, so dropping them turns every registry request back into a simple,
// preflight-free GET — which is why the Fetcher Worker strips them.
//
// That strip must NOT apply to every host: a signed S3 request would lose its
// `Authorization`/`x-amz-*` headers and go out anonymous — against a public
// bucket it would then succeed with a 200 and the WRONG bytes (a stripped
// `Range` returns the whole object) rather than an error. So the strip is
// scoped to the hosts that actually need it; every other target keeps its
// headers, pays for a preflight, and either works or fails loudly.

const CORS_SAFELISTED = new Set(["accept", "accept-language", "content-language", "content-type"]);

const SAFE_CONTENT_TYPES = new Set(["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"]);

// Public package registries: `Access-Control-Allow-Origin: *` on the GET, no
// answer to a preflight. A mirror is conventionally `registry.<something>`, and
// the prefix rule below covers those too.
const PREFLIGHT_HOSTILE_HOSTS = new Set(["registry.npmjs.org", "registry.yarnpkg.com", "registry.npmmirror.com"]);

/**
 * Should this URL's custom request headers be dropped to keep the request
 * preflight-free? True only for the package registries; same-origin requests are
 * not subject to CORS at all.
 */
const stripsCustomHeaders = (url: string, selfOrigin?: string): boolean => {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    // Not an absolute URL: same-origin by definition, so CORS does not apply.
    return false;
  }
  if (selfOrigin && u.origin === selfOrigin) return false;
  return PREFLIGHT_HOSTILE_HOSTS.has(u.hostname) || u.hostname.startsWith("registry.");
};

/** Keep only the CORS-safelisted request headers. */
const corsSafeHeaders = (headers: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (!CORS_SAFELISTED.has(lk)) continue;
    // A non-simple Content-Type value still triggers a preflight, so drop it too.
    if (lk === "content-type" && !SAFE_CONTENT_TYPES.has(v.split(";")[0]!.trim().toLowerCase())) continue;
    out[k] = v;
  }
  return out;
};

/** The headers to actually put on the browser `fetch()` for this URL. */
const egressHeaders = (
  url: string,
  headers: Record<string, string> | undefined,
  selfOrigin?: string,
): Record<string, string> | undefined => {
  if (!headers) return undefined;
  return stripsCustomHeaders(url, selfOrigin) ? corsSafeHeaders(headers) : headers;
};

export { CORS_SAFELISTED, PREFLIGHT_HOSTILE_HOSTS, corsSafeHeaders, egressHeaders, stripsCustomHeaders };
