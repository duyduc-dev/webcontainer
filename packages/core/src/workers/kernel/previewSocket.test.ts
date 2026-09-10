import { afterEach, describe, expect, it, vi } from "vitest";
import type { PipeRelayMessage } from "../../runtime/node/bindings/net";

const postEvent = vi.fn();
vi.mock("./service", () => ({ postEvent: (...args: unknown[]) => postEvent(...args) }));

const { createNetRelay } = await import("./netRelay");
const { closePreviewSocket, openPreviewSocket, sendPreviewSocketMessage } = await import("./previewSocket");
const { HttpParser, serializeResponse } = await import("../../runtime/node/internal/httpWireFormat");
const { WsFrameDecoder, encodeWsFrame } = await import("./wsFrame");

const TCP_XKEY_PREFIX = "\u0000dwc-tcp:";
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const computeAccept = async (key: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(key + WS_GUID));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** Stands in for a guest process whose http.js Server has handed a socket
 * off via 'upgrade' to a real WS server (e.g. Vite's bundled `ws`): accepts
 * the handshake (computing a real Sec-WebSocket-Accept) and, from then on,
 * decodes/encodes real RFC 6455 frames over the same pipe-relay transport
 * previewRelay.test.ts's fakeServerWorker uses for plain HTTP. */
const fakeWsServerWorker = (options: { extraBytesAfterHandshake?: Uint8Array; rejectHandshake?: boolean; badAccept?: boolean } = {}) => {
  const relay = { current: null as null | ReturnType<typeof createNetRelay> };
  const requestParser = new HttpParser("request");
  const decoders = new Map<number, InstanceType<typeof WsFrameDecoder>>();
  const received: { connId: number; data: string }[] = [];

  const postMessage = async (message: { type: string; payload: PipeRelayMessage }) => {
    if (message.type !== "net-pipe-message") return;
    const pipeMessage = message.payload;
    if (pipeMessage.type === "pipe-open") return;

    if (pipeMessage.type === "pipe-data" && pipeMessage.chunk) {
      if (!decoders.has(pipeMessage.connId)) {
        // Still handshaking for this connId.
        const [request] = requestParser.execute(pipeMessage.chunk);
        if (!request) return;

        if (options.rejectHandshake) {
          relay.current!.relay("server-1", {
            type: "pipe-data",
            connId: pipeMessage.connId,
            chunk: serializeResponse(400, "Bad Request", { "Content-Length": "0" }),
          });
          return;
        }

        const accept = options.badAccept ? "not-a-real-accept-value" : await computeAccept(String(request.headers["sec-websocket-key"]));
        const headResponse = serializeResponse(101, "Switching Protocols", {
          Upgrade: "websocket",
          Connection: "Upgrade",
          "Sec-WebSocket-Accept": accept,
        });
        let toSend = headResponse;
        if (options.extraBytesAfterHandshake) {
          const combined = new Uint8Array(headResponse.length + options.extraBytesAfterHandshake.length);
          combined.set(headResponse, 0);
          combined.set(options.extraBytesAfterHandshake, headResponse.length);
          toSend = combined;
        }
        decoders.set(pipeMessage.connId, new WsFrameDecoder());
        relay.current!.relay("server-1", { type: "pipe-data", connId: pipeMessage.connId, chunk: toSend });
        return;
      }

      const decoder = decoders.get(pipeMessage.connId)!;
      const messages = decoder.push(pipeMessage.chunk);
      for (const decoded of messages) {
        if (decoded.opcode === "text") received.push({ connId: pipeMessage.connId, data: new TextDecoder().decode(decoded.payload) });
        if (decoded.opcode === "close") {
          relay.current!.relay("server-1", { type: "pipe-close", connId: pipeMessage.connId });
        }
      }
    }
  };

  return {
    postMessage,
    setRelay: (r: ReturnType<typeof createNetRelay>) => (relay.current = r),
    sendText: (connId: number, text: string) =>
      relay.current!.relay("server-1", { type: "pipe-data", connId, chunk: encodeWsFrame("text", new TextEncoder().encode(text)) }),
    sendClose: (connId: number) => relay.current!.relay("server-1", { type: "pipe-data", connId, chunk: encodeWsFrame("close", new Uint8Array(0)) }),
    received,
  };
};

const setUpListeningServer = (port: number, options?: Parameters<typeof fakeWsServerWorker>[0]) => {
  const netRelay = createNetRelay();
  const server = fakeWsServerWorker(options);
  server.setRelay(netRelay);
  netRelay.registerWorker("server-1", server as unknown as Worker);
  netRelay.pipeListen("server-1", `${TCP_XKEY_PREFIX}${port}`);
  return { netRelay, server };
};

afterEach(() => {
  postEvent.mockClear();
});

describe("openPreviewSocket", () => {
  it("performs a real RFC 6455 handshake and resolves {wsId, protocol}", async () => {
    const { netRelay } = setUpListeningServer(6000);
    const result = await openPreviewSocket(netRelay, 6000, "/ws", ["vite-hmr"]);

    expect(typeof result.wsId).toBe("number");
    closePreviewSocket(result.wsId);
  });

  it("rejects with ERR_PREVIEW_CONNECTION_REFUSED when nothing is listening", async () => {
    const netRelay = createNetRelay();
    await expect(openPreviewSocket(netRelay, 9998, "/ws")).rejects.toMatchObject({ code: "ERR_PREVIEW_CONNECTION_REFUSED" });
  });

  it("rejects with ERR_PREVIEW_WS_HANDSHAKE_FAILED on a non-101 response", async () => {
    const { netRelay } = setUpListeningServer(6001, { rejectHandshake: true });
    await expect(openPreviewSocket(netRelay, 6001, "/ws")).rejects.toMatchObject({ code: "ERR_PREVIEW_WS_HANDSHAKE_FAILED" });
  });

  it("rejects with ERR_PREVIEW_WS_HANDSHAKE_FAILED on a wrong Sec-WebSocket-Accept", async () => {
    const { netRelay } = setUpListeningServer(6002, { badAccept: true });
    await expect(openPreviewSocket(netRelay, 6002, "/ws")).rejects.toMatchObject({ code: "ERR_PREVIEW_WS_HANDSHAKE_FAILED" });
  });

  it("decodes a WS frame stapled to the same chunk as the 101 handshake response", async () => {
    const firstFrame = encodeWsFrame("text", new TextEncoder().encode("hello-immediately"));
    const { netRelay } = setUpListeningServer(6003, { extraBytesAfterHandshake: firstFrame });

    const { wsId } = await openPreviewSocket(netRelay, 6003, "/ws");

    expect(postEvent).toHaveBeenCalledWith("preview:ws-message", { wsId, data: "hello-immediately" });
    closePreviewSocket(wsId);
  });
});

describe("sendPreviewSocketMessage / closePreviewSocket", () => {
  it("sends a correctly-masked text frame the guest server can decode", async () => {
    const { netRelay, server } = setUpListeningServer(6004);
    const { wsId } = await openPreviewSocket(netRelay, 6004, "/ws");

    sendPreviewSocketMessage(wsId, "ping from host");

    expect(server.received).toEqual([{ connId: wsId, data: "ping from host" }]);
    closePreviewSocket(wsId);
  });

  it("delivers guest-sent text messages via a preview:ws-message event", async () => {
    const { netRelay, server } = setUpListeningServer(6005);
    const { wsId } = await openPreviewSocket(netRelay, 6005, "/ws");
    postEvent.mockClear();

    server.sendText(wsId, "hmr update");
    expect(postEvent).toHaveBeenCalledWith("preview:ws-message", { wsId, data: "hmr update" });

    closePreviewSocket(wsId);
  });

  it("emits preview:ws-close when the guest sends a close frame", async () => {
    const { netRelay, server } = setUpListeningServer(6006);
    const { wsId } = await openPreviewSocket(netRelay, 6006, "/ws");
    postEvent.mockClear();

    server.sendClose(wsId);
    expect(postEvent).toHaveBeenCalledWith("preview:ws-close", expect.objectContaining({ wsId }));

    // A second send after close should silently no-op, not throw.
    expect(() => sendPreviewSocketMessage(wsId, "too late")).not.toThrow();
  });

  it("emits a code-1006 preview:ws-close when the underlying connection dies mid-session (simulated crash)", async () => {
    const netRelay = createNetRelay();
    const server = fakeWsServerWorker();
    server.setRelay(netRelay);
    netRelay.registerWorker("server-1", server as unknown as Worker);
    netRelay.pipeListen("server-1", `${TCP_XKEY_PREFIX}6007`);

    const { wsId } = await openPreviewSocket(netRelay, 6007, "/ws");
    postEvent.mockClear();

    netRelay.unregisterWorker("server-1"); // simulates the guest process crashing

    expect(postEvent).toHaveBeenCalledWith("preview:ws-close", { wsId, code: 1006, reason: "connection closed" });
  });

  it("no-ops silently on an unknown wsId", () => {
    expect(() => sendPreviewSocketMessage(999999, "x")).not.toThrow();
    expect(() => closePreviewSocket(999999)).not.toThrow();
  });
});
