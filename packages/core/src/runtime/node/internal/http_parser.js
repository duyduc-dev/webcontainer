// internal/http_parser — the guest-loadable wrapper around
// httpWireFormat.ts's HttpParser/serializeRequest/serializeResponse. See
// that file's own doc comment for the full rationale (real Node's own HTTP
// parsing isn't pure JS, so there's nothing to vendor verbatim for this the
// way net.js/dns.js/tls.js were) and scope. Kept as a separate factory
// wrapper (rather than registering httpWireFormat.ts itself as a builtin)
// only because every other guest-loadable internal module follows this same
// `export default function (exports, require, module, ...)` shape -
// workers/kernel/previewRelay.ts imports httpWireFormat.ts directly instead,
// since it isn't guest code and doesn't need this wrapper at all.
import { HttpParser, serializeRequest, serializeResponse } from "./httpWireFormat";

export default function (exports, require, module) {
  "use strict";
  module.exports = { HttpParser, serializeRequest, serializeResponse };
}
