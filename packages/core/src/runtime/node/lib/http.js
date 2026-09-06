// http — a fetch-backed client, for external destinations only.
//
// There is no in-VM loopback `net` yet (a local dev-server proxy is a separate,
// unbuilt feature — see the kernel's own "listen" event for guest servers),
// so unlike real Node's http.js there is no local-socket path to fall back to
// here: every request rides the same Fetcher Worker bridge https.js uses (see
// internal/fetch-transport.js). When a real socket-backed `net`/local-loopback
// path is added, this module should grow the http/https split real Node has
// (only route non-local http:// traffic through fetch) rather than being
// fetch-only for everything, matching vivari's own http/https split.
export default function (exports, require, module, process, internalBinding, primordials) {
  "use strict";
  const EventEmitter = require("events");
  const { createFetchClient, makeDummySocket } = require("internal/fetch-transport");

  const { ClientRequest, request, get } = createFetchClient({
    protocol: "http:",
    defaultPort: 80,
    encrypted: false,
  });

  class Agent extends EventEmitter {
    constructor(options) {
      super();
      this.options = options || {};
      this.defaultPort = 80;
      this.protocol = "http:";
      this.requests = {};
      this.sockets = {};
      this.freeSockets = {};
      this.maxSockets = Infinity;
      this.maxFreeSockets = 256;
      this.maxTotalSockets = Infinity;
      this.keepAlive = !!this.options.keepAlive;
    }
    createConnection() {
      return makeDummySocket(80, false);
    }
    addRequest() {}
    keepSocketAlive() {
      return true;
    }
    reuseSocket() {}
    destroy() {}
    getName() {
      return "";
    }
  }

  const globalAgent = new Agent({ keepAlive: false });

  const notImpl = () => {
    const err = new Error("in-VM http servers are not supported yet");
    err.code = "ERR_METHOD_NOT_IMPLEMENTED";
    throw err;
  };

  // Real Node's http.STATUS_CODES - a fixed, standard table (IANA HTTP status
  // registry), never derived from a live server - traced need: real npm's
  // own minipass-fetch (via make-fetch-happen -> npm-registry-fetch) builds
  // its Response objects off `require('http').STATUS_CODES[res.statusCode]`,
  // which only exists on `http` in real Node even for an https:// request.
  const STATUS_CODES = {
    100: "Continue",
    101: "Switching Protocols",
    102: "Processing",
    103: "Early Hints",
    200: "OK",
    201: "Created",
    202: "Accepted",
    203: "Non-Authoritative Information",
    204: "No Content",
    205: "Reset Content",
    206: "Partial Content",
    207: "Multi-Status",
    208: "Already Reported",
    226: "IM Used",
    300: "Multiple Choices",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "Not Modified",
    305: "Use Proxy",
    307: "Temporary Redirect",
    308: "Permanent Redirect",
    400: "Bad Request",
    401: "Unauthorized",
    402: "Payment Required",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    407: "Proxy Authentication Required",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    411: "Length Required",
    412: "Precondition Failed",
    413: "Payload Too Large",
    414: "URI Too Long",
    415: "Unsupported Media Type",
    416: "Range Not Satisfiable",
    417: "Expectation Failed",
    418: "I'm a Teapot",
    421: "Misdirected Request",
    422: "Unprocessable Entity",
    423: "Locked",
    424: "Failed Dependency",
    425: "Too Early",
    426: "Upgrade Required",
    428: "Precondition Required",
    429: "Too Many Requests",
    431: "Request Header Fields Too Large",
    451: "Unavailable For Legal Reasons",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
    505: "HTTP Version Not Supported",
    506: "Variant Also Negotiates",
    507: "Insufficient Storage",
    508: "Loop Detected",
    509: "Bandwidth Limit Exceeded",
    510: "Not Extended",
    511: "Network Authentication Required",
  };

  module.exports = {
    STATUS_CODES,
    Agent,
    globalAgent,
    ClientRequest,
    request,
    get,
    Server: class Server {
      constructor() {
        notImpl();
      }
    },
    createServer: notImpl,
  };
}
