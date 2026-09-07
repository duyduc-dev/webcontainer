// Hand-written, not vendored, and deliberately NOT a real HTTP/2
// implementation (session/stream/connect - actual protocol multiplexing -
// is a genuinely large undertaking, wildly disproportionate to the traced
// need below; nothing in this runtime's dependency tree does real HTTP/2).
// `http2.constants` is just a fixed lookup table (header names in their
// lowercase wire form, standard status codes) - real Node's own version of
// it is equally static, generated from a spec, not executable protocol
// logic - so THAT part is worth providing accurately.
//
// Traced need: sigstore's own @sigstore/sign dependency (npm's package-
// provenance/signing verification path) destructures
// `http2.constants` for header-name/status-code readability, then does its
// actual networking through make-fetch-happen (plain fetch/https), never
// touching a real http2 session. Scoped to exactly the constants any
// traced caller uses, plus the rest of the equally common, equally
// unambiguous ones (a header's kebab-case wire form and a standard status
// code are spec facts, not guesses) - genuine session/server/stream APIs
// are NOT provided and would throw "is not a function" if code ever
// reached for them, same as any other gap this runtime hasn't hit yet.
const HTTP2_HEADER_CONSTANTS = {
  HTTP2_HEADER_STATUS: ":status",
  HTTP2_HEADER_METHOD: ":method",
  HTTP2_HEADER_AUTHORITY: ":authority",
  HTTP2_HEADER_SCHEME: ":scheme",
  HTTP2_HEADER_PATH: ":path",
  HTTP2_HEADER_ACCEPT: "accept",
  HTTP2_HEADER_ACCEPT_ENCODING: "accept-encoding",
  HTTP2_HEADER_ACCEPT_LANGUAGE: "accept-language",
  HTTP2_HEADER_AUTHORIZATION: "authorization",
  HTTP2_HEADER_CACHE_CONTROL: "cache-control",
  HTTP2_HEADER_CONTENT_ENCODING: "content-encoding",
  HTTP2_HEADER_CONTENT_LENGTH: "content-length",
  HTTP2_HEADER_CONTENT_TYPE: "content-type",
  HTTP2_HEADER_COOKIE: "cookie",
  HTTP2_HEADER_DATE: "date",
  HTTP2_HEADER_ETAG: "etag",
  HTTP2_HEADER_HOST: "host",
  HTTP2_HEADER_IF_MODIFIED_SINCE: "if-modified-since",
  HTTP2_HEADER_IF_NONE_MATCH: "if-none-match",
  HTTP2_HEADER_LAST_MODIFIED: "last-modified",
  HTTP2_HEADER_LOCATION: "location",
  HTTP2_HEADER_RETRY_AFTER: "retry-after",
  HTTP2_HEADER_SET_COOKIE: "set-cookie",
  HTTP2_HEADER_USER_AGENT: "user-agent",
} as const;

const HTTP_STATUS_CONSTANTS = {
  HTTP_STATUS_CONTINUE: 100,
  HTTP_STATUS_OK: 200,
  HTTP_STATUS_CREATED: 201,
  HTTP_STATUS_ACCEPTED: 202,
  HTTP_STATUS_NO_CONTENT: 204,
  HTTP_STATUS_MOVED_PERMANENTLY: 301,
  HTTP_STATUS_FOUND: 302,
  HTTP_STATUS_SEE_OTHER: 303,
  HTTP_STATUS_NOT_MODIFIED: 304,
  HTTP_STATUS_TEMPORARY_REDIRECT: 307,
  HTTP_STATUS_PERMANENT_REDIRECT: 308,
  HTTP_STATUS_BAD_REQUEST: 400,
  HTTP_STATUS_UNAUTHORIZED: 401,
  HTTP_STATUS_FORBIDDEN: 403,
  HTTP_STATUS_NOT_FOUND: 404,
  HTTP_STATUS_METHOD_NOT_ALLOWED: 405,
  HTTP_STATUS_REQUEST_TIMEOUT: 408,
  HTTP_STATUS_CONFLICT: 409,
  HTTP_STATUS_GONE: 410,
  HTTP_STATUS_TOO_MANY_REQUESTS: 429,
  HTTP_STATUS_INTERNAL_SERVER_ERROR: 500,
  HTTP_STATUS_NOT_IMPLEMENTED: 501,
  HTTP_STATUS_BAD_GATEWAY: 502,
  HTTP_STATUS_SERVICE_UNAVAILABLE: 503,
  HTTP_STATUS_GATEWAY_TIMEOUT: 504,
} as const;

const createHttp2Module = () => ({
  constants: { ...HTTP2_HEADER_CONSTANTS, ...HTTP_STATUS_CONSTANTS },
});

export { createHttp2Module };
