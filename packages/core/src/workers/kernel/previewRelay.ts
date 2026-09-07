// previewRelay — lets the KERNEL itself act as an HTTP client into a guest
// process's http.createServer(), on the host page's behalf. This is Phase 2
// of dev-server-preview support (StackBlitz-style "run npm run dev
// and see it live"): Phase 1 (runtime/node/lib/http.js) made
// http.createServer() work at all, reachable from another guest process
// over the kernel's existing cross-process net relay (workers/kernel/
// netRelay.ts) - this makes it reachable from the HOST PAGE, which isn't a
// guest process and has no Process Worker of its own to register.
//
// netRelay.ts's "virtual client" support (registerVirtualClient) exists
// exactly for this: from the server side's perspective, a virtual client is
// indistinguishable from a real, different Process Worker dialing in - the
// exact cross-process path already verified live (a server in one process,
// reached from a script in a completely different process) applies
// unchanged here, just with the kernel itself standing in for "the other
// process." Speaks real HTTP/1.1 bytes (internal/httpWireFormat.ts - the
// same parser/serializer runtime/node/internal/http_parser.js wraps for
// guest code) directly over the existing pipe-relay transport, rather than
// inventing a second, parallel request/response protocol on top of
// postMessage.
import type { NetRelay } from "./netRelay";
import type { PipeRelayMessage } from "../../runtime/node/bindings/net";
import { HttpParser, serializeRequest } from "../../runtime/node/internal/httpWireFormat";
import type { Headers as HttpHeaders } from "../../runtime/node/internal/httpWireFormat";
import { DWCError, ERR_PREVIEW_CONNECTION_REFUSED } from "../../protocol/errors";

// Mirrors bindings/net.ts's own private tcpXKey() exactly (a TCP port is
// advertised for cross-process dialing under this synthetic pipe key) -
// duplicated rather than imported since net.ts doesn't export it (it's an
// internal encoding detail of that file), but the format is a stable,
// load-bearing wire contract between the two sides either way.
const TCP_XKEY_PREFIX = "\u0000dwc-tcp:";
const tcpXKey = (port: number): string => `${TCP_XKEY_PREFIX}${port >>> 0}`;

interface PreviewFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
}

interface PreviewFetchResult {
  status: number;
  statusMessage: string;
  headers: HttpHeaders;
  body: Uint8Array;
}

let nextClientId = 1;

/** Fetches one request/response from whichever guest process's
 * `http.createServer()` is listening on `port`. Rejects with a
 * `code: ERR_PREVIEW_CONNECTION_REFUSED` error if nothing is listening. One call = one
 * connection (matches http.js's own ServerResponse always sending
 * `Connection: close`) - no keep-alive/pooling. */
const fetchFromGuestServer = (netRelay: NetRelay, port: number, path: string, init: PreviewFetchInit = {}): Promise<PreviewFetchResult> =>
  new Promise((resolve, reject) => {
    const clientId = `preview-${nextClientId++}`;
    const parser = new HttpParser("response");
    let settled = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      netRelay.unregisterVirtualClient(clientId);
      fn();
    };

    netRelay.registerVirtualClient(clientId, (message: PipeRelayMessage) => {
      if (message.type === "pipe-data" && message.chunk) {
        let parsed;
        try {
          parsed = parser.execute(message.chunk);
        } catch (error) {
          finish(() => reject(error instanceof Error ? error : new Error(String(error))));
          return;
        }
        const response = parsed[0];
        if (response) {
          finish(() =>
            resolve({
              status: response.statusCode!,
              statusMessage: response.statusMessage!,
              headers: response.headers,
              body: response.body,
            }),
          );
        }
        return;
      }
      if (message.type === "pipe-close" || message.type === "pipe-shutdown") {
        finish(() => reject(new Error(`connection to port ${port} closed before a full response arrived`)));
      }
    });

    const connId = netRelay.pipeConnect(clientId, tcpXKey(port));
    if (connId === 0) {
      netRelay.unregisterVirtualClient(clientId);
      reject(new DWCError(ERR_PREVIEW_CONNECTION_REFUSED, `nothing is listening on port ${port}`));
      return;
    }

    const headers: HttpHeaders = { Host: "localhost", Connection: "close", ...init.headers };
    const body = init.body;
    if (body && body.length > 0 && !("Content-Length" in headers) && !("content-length" in headers)) {
      headers["Content-Length"] = String(body.length);
    }
    const requestBytes = serializeRequest(init.method || "GET", path, headers, body);
    netRelay.relay(clientId, { type: "pipe-data", connId, chunk: requestBytes });
  });

export { fetchFromGuestServer };
export type { PreviewFetchInit, PreviewFetchResult };
