// http — a fetch-backed client (for external destinations) PLUS a real
// in-VM server built on this runtime's own vendored `net` module.
//
// The client side is unchanged: every OUTBOUND request still rides the same
// Fetcher Worker bridge https.js uses (see internal/fetch-transport.js) -
// `net`'s own loopback (same-process AND cross-process, via the kernel's
// netRelay) exists now, but nothing here yet routes a `localhost`/loopback
// destination through it instead of fetch; that's a separate follow-up, not
// bundled into this change.
//
// The SERVER side (`http.createServer()`) is new: it runs on top of
// `net.createServer()` (real, vendored Node net.js, already working) plus a
// hand-written HTTP/1.1 parser (internal/http_parser.js) - real Node's own
// server parsing isn't pure JS (it hands raw bytes to `llhttp`, a native
// binding), so there's no equivalent to vendor the way net.js/dns.js/tls.js
// were. Traced need: this is the foundation an in-VM dev server (e.g. Vite)
// needs to exist at all - see internal/http_parser.js's own doc comment for
// the parser's scope, and this file's ServerResponse for the "buffer the
// whole response, decide framing once .end() is called" simplification
// that keeps this from also needing a fully general chunked-output writer.
export default function (exports, require, module, process, internalBinding, primordials) {
  "use strict";
  const EventEmitter = require("events");
  const { createFetchClient, makeDummySocket } = require("internal/fetch-transport");
  const net = require("net");
  const { Readable, Writable } = require("stream");
  const { Buffer } = require("buffer");
  const { HttpParser, serializeResponse } = require("internal/http_parser");

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

  // Wraps a fully-parsed request (see internal/http_parser.js - the WHOLE
  // body has already arrived by the time this exists) as a real Readable,
  // so `req.pipe(...)`/`req.on('data', ...)` behave like real Node even
  // though there's no actual streaming happening underneath.
  const createIncomingMessage = (message, socket) => {
    const body = message.body && message.body.length > 0 ? [Buffer.from(message.body)] : [];
    const req = Readable.from(body);
    req.method = message.method;
    req.url = message.url;
    req.httpVersion = message.httpVersion;
    req.headers = message.headers;
    req.rawHeaders = message.rawHeaders;
    req.socket = socket;
    req.connection = socket;
    return req;
  };

  // Deliberately buffers every written chunk and only decides response
  // framing once `.end()` closes the stream (see this file's own top
  // comment) - real streaming output would need a general chunked-transfer
  // writer, which nothing traced needs yet. `Connection: close` is always
  // set since every response also closes its own socket (one request per
  // connection) rather than implementing real HTTP/1.1 keep-alive.
  class ServerResponse extends Writable {
    constructor(socket) {
      super();
      this.socket = socket;
      this.connection = socket;
      this.statusCode = 200;
      this.statusMessage = undefined;
      this.headersSent = false;
      this._headers = {};
      this._chunks = [];
    }

    setHeader(name, value) {
      this._headers[String(name).toLowerCase()] = value;
      return this;
    }

    getHeader(name) {
      return this._headers[String(name).toLowerCase()];
    }

    removeHeader(name) {
      delete this._headers[String(name).toLowerCase()];
    }

    hasHeader(name) {
      return String(name).toLowerCase() in this._headers;
    }

    writeHead(statusCode, statusMessageOrHeaders, maybeHeaders) {
      this.statusCode = statusCode;
      let headers = maybeHeaders;
      if (typeof statusMessageOrHeaders === "string") {
        this.statusMessage = statusMessageOrHeaders;
      } else if (statusMessageOrHeaders && typeof statusMessageOrHeaders === "object") {
        headers = statusMessageOrHeaders;
      }
      if (headers) {
        for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
      }
      return this;
    }

    _write(chunk, encoding, callback) {
      this._chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      callback();
    }

    _final(callback) {
      const body = Buffer.concat(this._chunks);
      if (!this.hasHeader("content-length")) this.setHeader("Content-Length", String(body.length));
      this.setHeader("Connection", "close");
      this.headersSent = true;
      const raw = serializeResponse(this.statusCode, this.statusMessage || STATUS_CODES[this.statusCode] || "", this._headers, body);
      this.socket.write(raw, () => {
        this.socket.end();
        callback();
      });
    }
  }

  // Real Node's http.Server IS a net.Server (it extends it directly); this
  // wraps one instead of extending it, which is simpler given `net`'s own
  // Server here is real vendored Node source this file shouldn't need to
  // subclass through - the observable API (`.listen()`, `'request'`,
  // `'listening'`, `'error'`, `.close()`, `.address()`) is the same either
  // way.
  class Server extends EventEmitter {
    constructor(handler) {
      super();
      if (typeof handler === "function") this.on("request", handler);
      this._netServer = net.createServer((socket) => {
        const parser = new HttpParser("request");
        socket.on("data", (chunk) => {
          let messages;
          try {
            messages = parser.execute(chunk);
          } catch (error) {
            socket.destroy(error);
            return;
          }
          for (const message of messages) {
            const req = createIncomingMessage(message, socket);
            const res = new ServerResponse(socket);
            this.emit("request", req, res);
          }
        });
        socket.on("error", () => {});
      });
    }

    listen(...args) {
      let port;
      let callback;
      for (const arg of args) {
        if (typeof arg === "function") callback = arg;
        else if (typeof arg === "number") port = arg;
      }
      if (callback) this.once("listening", callback);
      this._netServer.on("listening", () => this.emit("listening"));
      this._netServer.on("error", (error) => this.emit("error", error));
      this._netServer.listen(port);
      return this;
    }

    close(callback) {
      this._netServer.close(callback);
      return this;
    }

    address() {
      return this._netServer.address();
    }
  }

  const createServer = (handler) => new Server(handler);

  module.exports = {
    STATUS_CODES,
    Agent,
    globalAgent,
    ClientRequest,
    request,
    get,
    Server,
    createServer,
    IncomingMessage: Readable,
    ServerResponse,
  };
}
