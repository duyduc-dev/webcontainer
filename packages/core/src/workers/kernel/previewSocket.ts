// previewSocket — the WebSocket counterpart to previewRelay.ts's
// fetchFromGuestServer: lets the KERNEL itself open a persistent, raw
// RFC 6455 connection into a guest process's http.createServer() (which,
// on an Upgrade request, hands the connection to real Vite's own bundled
// `ws`-shaped WebSocketServer - see runtime/node/lib/http.js's 'upgrade'
// event), on the host page's behalf. This is what makes Vite's HMR client
// (which the Service Worker relay can never intercept - a real browser
// platform limitation on 'new WebSocket()' - see workers/preview/
// wsPolyfill.ts) actually reach a live connection.
//
// Reuses the exact same netRelay.pipeConnect/relay transport
// previewRelay.ts does - proven (workers/kernel/netRelay.ts) to already be
// persistent and bidirectional with no built-in message-count limit; the
// "one request then close" behavior of the plain HTTP preview path is
// purely a policy choice made there, not a transport constraint.
import type { NetRelay } from "./netRelay";
import type { PipeRelayMessage } from "../../runtime/node/bindings/net";
import { HttpParser, serializeRequest } from "../../runtime/node/internal/httpWireFormat";
import { WsFrameDecoder, decodeCloseFramePayload, encodeCloseFramePayload, encodeWsFrame } from "./wsFrame";
import { DWCError, ERR_PREVIEW_CONNECTION_REFUSED, ERR_PREVIEW_WS_HANDSHAKE_FAILED } from "../../protocol/errors";
import { postEvent } from "./service";

// Mirrors previewRelay.ts's own duplicated tcpXKey() encoding exactly (see
// that file's comment - bindings/net.ts doesn't export it, but the wire
// format is a stable contract either way).
const TCP_XKEY_PREFIX = "\u0000dwc-tcp:";
const tcpXKey = (port: number): string => `${TCP_XKEY_PREFIX}${port >>> 0}`;

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

interface ConnState {
  netRelay: NetRelay;
  clientId: string;
  connId: number;
  state: "handshaking" | "open" | "closed";
  handshakeParser: HttpParser;
  wsKey: string;
  decoder: WsFrameDecoder;
  sentClose: boolean;
}

const conns = new Map<number, ConnState>();
let nextClientId = 1;

const randomWsKey = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const computeAcceptKey = async (key: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(key + WS_GUID));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const teardown = (wsId: number): void => {
  const conn = conns.get(wsId);
  if (!conn) return;
  conns.delete(wsId);
  conn.state = "closed";
  conn.netRelay.unregisterVirtualClient(conn.clientId);
};

/** Opens a persistent WebSocket connection to whichever guest process's
 * `http.createServer()` is listening on `port`, performing a real RFC 6455
 * handshake over the same cross-process pipe previewRelay.ts's plain-HTTP
 * fetch uses. Resolves once the guest confirms with a valid `101 Switching
 * Protocols` response; rejects with `code: ERR_PREVIEW_CONNECTION_REFUSED`
 * if nothing is listening, or `code: ERR_PREVIEW_WS_HANDSHAKE_FAILED` if
 * the response isn't a valid upgrade acceptance. */
const openPreviewSocket = (netRelay: NetRelay, port: number, path: string, protocols?: string[]): Promise<{ wsId: number; protocol: string }> =>
  new Promise((resolve, reject) => {
    const clientId = `preview-ws-${nextClientId++}`;
    const wsKey = randomWsKey();
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      netRelay.unregisterVirtualClient(clientId);
      reject(error);
    };

    const handshakeParser = new HttpParser("response");

    const handleHandshakeChunk = async (respondingConnId: number, chunk: Uint8Array): Promise<void> => {
      const parsed = handshakeParser.execute(chunk);
      const response = parsed[0];
      if (!response) return;

      const upgrade = String(response.headers.upgrade || "").toLowerCase();
      const connectionHeader = String(response.headers.connection || "").toLowerCase();
      const accept = response.headers["sec-websocket-accept"];
      const extensions = response.headers["sec-websocket-extensions"];
      const expectedAccept = await computeAcceptKey(wsKey);

      if (
        response.statusCode !== 101 ||
        upgrade !== "websocket" ||
        !/(^|,)\s*upgrade\s*($|,)/.test(connectionHeader) ||
        extensions !== undefined ||
        accept !== expectedAccept
      ) {
        fail(new DWCError(ERR_PREVIEW_WS_HANDSHAKE_FAILED, `invalid WebSocket handshake response from port ${port}`));
        return;
      }

      settled = true;
      const decoder = new WsFrameDecoder();
      const conn: ConnState = {
        netRelay,
        clientId,
        connId: respondingConnId,
        state: "open",
        handshakeParser,
        wsKey,
        decoder,
        sentClose: false,
      };
      conns.set(respondingConnId, conn);

      const leftover = handshakeParser.drainPending();
      if (leftover.length > 0) handleFrameChunk(conn, leftover);

      const protocol = typeof response.headers["sec-websocket-protocol"] === "string" ? response.headers["sec-websocket-protocol"] : "";
      resolve({ wsId: respondingConnId, protocol });
    };

    netRelay.registerVirtualClient(clientId, (message: PipeRelayMessage) => {
      const conn = settled ? conns.get(message.connId) : undefined;

      if (message.type === "pipe-close" || message.type === "pipe-shutdown") {
        if (!settled) {
          fail(new Error(`connection to port ${port} closed before the WebSocket handshake completed`));
          return;
        }
        if (conn) {
          const wasOpen = conn.state === "open";
          teardown(conn.connId);
          if (wasOpen) postEvent("preview:ws-close", { wsId: conn.connId, code: 1006, reason: "connection closed" });
        }
        return;
      }

      if (message.type !== "pipe-data" || !message.chunk) return;

      if (!settled) {
        // Still handshaking: `conn` doesn't exist yet (it's only created
        // inside handleHandshakeChunk, once the 101 response is verified).
        handleHandshakeChunk(message.connId, message.chunk).catch(fail);
        return;
      }

      if (conn && conn.state === "open") handleFrameChunk(conn, message.chunk);
    });

    const connId = netRelay.pipeConnect(clientId, tcpXKey(port));
    if (connId === 0) {
      netRelay.unregisterVirtualClient(clientId);
      reject(new DWCError(ERR_PREVIEW_CONNECTION_REFUSED, `nothing is listening on port ${port}`));
      return;
    }

    const headers: Record<string, string> = {
      Host: "localhost",
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": wsKey,
    };
    if (protocols && protocols.length > 0) headers["Sec-WebSocket-Protocol"] = protocols.join(", ");

    const requestBytes = serializeRequest("GET", path, headers);
    netRelay.relay(clientId, { type: "pipe-data", connId, chunk: requestBytes });
  });

const handleFrameChunk = (conn: ConnState, chunk: Uint8Array): void => {
  let messages;
  try {
    messages = conn.decoder.push(chunk);
  } catch (error) {
    teardown(conn.connId);
    postEvent("preview:ws-close", { wsId: conn.connId, code: 1002, reason: error instanceof Error ? error.message : String(error) });
    return;
  }

  for (const message of messages) {
    if (message.opcode === "text") {
      postEvent("preview:ws-message", { wsId: conn.connId, data: new TextDecoder().decode(message.payload) });
    } else if (message.opcode === "ping") {
      conn.netRelay.relay(conn.clientId, {
        type: "pipe-data",
        connId: conn.connId,
        chunk: encodeWsFrame("pong", message.payload, crypto.getRandomValues(new Uint8Array(4))),
      });
    } else if (message.opcode === "close") {
      const wasOpen = conn.state === "open";
      if (!conn.sentClose) {
        conn.sentClose = true;
        conn.netRelay.relay(conn.clientId, {
          type: "pipe-data",
          connId: conn.connId,
          chunk: encodeWsFrame("close", message.payload, crypto.getRandomValues(new Uint8Array(4))),
        });
      }
      conn.netRelay.relay(conn.clientId, { type: "pipe-close", connId: conn.connId });
      teardown(conn.connId);
      if (wasOpen) postEvent("preview:ws-close", { wsId: conn.connId, ...decodeCloseFramePayload(message.payload) });
    }
    // "binary"/"pong" text carry no action Vite's HMR client needs.
  }
};

/** Sends a text message down an open connection. Silently no-ops on an
 * unknown or already-closed `wsId` (same fire-and-forget tolerance as
 * PROCESS_STDIN/PROCESS_KILL - a close-then-send race is expected, not
 * exceptional). */
const sendPreviewSocketMessage = (wsId: number, data: string): void => {
  const conn = conns.get(wsId);
  if (!conn || conn.state !== "open") return;
  const mask = crypto.getRandomValues(new Uint8Array(4));
  conn.netRelay.relay(conn.clientId, { type: "pipe-data", connId: conn.connId, chunk: encodeWsFrame("text", new TextEncoder().encode(data), mask) });
};

/** Sends a close frame and tears the connection down. No-ops silently on an
 * unknown/already-closed `wsId`. */
const closePreviewSocket = (wsId: number, code = 1000, reason = ""): void => {
  const conn = conns.get(wsId);
  if (!conn || conn.state !== "open") return;
  const mask = crypto.getRandomValues(new Uint8Array(4));
  conn.sentClose = true;
  conn.netRelay.relay(conn.clientId, {
    type: "pipe-data",
    connId: conn.connId,
    chunk: encodeWsFrame("close", encodeCloseFramePayload(code, reason), mask),
  });
  conn.netRelay.relay(conn.clientId, { type: "pipe-close", connId: conn.connId });
  teardown(wsId);
};

export { closePreviewSocket, openPreviewSocket, sendPreviewSocketMessage };
