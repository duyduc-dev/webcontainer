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

  module.exports = {
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
