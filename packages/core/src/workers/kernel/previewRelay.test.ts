import { describe, expect, it } from "vitest";
import { createNetRelay } from "./netRelay";
import { fetchFromGuestServer } from "./previewRelay";
import { HttpParser, serializeRequest, serializeResponse } from "../../runtime/node/internal/httpWireFormat";
import type { PipeRelayMessage } from "../../runtime/node/bindings/net";

/** Stands in for a guest process's own bindings/net.ts + http.js Server:
 * listens on a pipe key, and for every request it fully parses, replies
 * with a canned HTTP response - real net.ts's own cross-process relay
 * already routes pipe-open/pipe-data/pipe-close through exactly this
 * `postMessage`-shaped surface (verified live against the real
 * implementation in the browser), so a fake with the same shape is a
 * faithful stand-in for unit testing previewRelay.ts in isolation. */
const fakeServerWorker = (respond: (path: string) => { status: number; statusMessage: string; body: string }) => {
  const relay = { current: null as null | ReturnType<typeof createNetRelay> };
  const requestParser = new HttpParser("request");
  const postMessage = (message: { type: string; payload: PipeRelayMessage }) => {
    if (message.type !== "net-pipe-message") return;
    const pipeMessage = message.payload;
    if (pipeMessage.type === "pipe-open") return; // connection accepted, nothing to send yet
    if (pipeMessage.type === "pipe-data" && pipeMessage.chunk) {
      const [request] = requestParser.execute(pipeMessage.chunk);
      if (!request) return;
      const { status, statusMessage, body } = respond(request.url!);
      const bodyBytes = new TextEncoder().encode(body);
      const responseBytes = serializeResponse(status, statusMessage, { "Content-Length": String(bodyBytes.length) }, bodyBytes);
      relay.current!.relay("server-1", { type: "pipe-data", connId: pipeMessage.connId, chunk: responseBytes });
    }
  };
  return { postMessage, setRelay: (r: ReturnType<typeof createNetRelay>) => (relay.current = r) };
};

describe("fetchFromGuestServer", () => {
  it("fetches a response from a guest server listening on the given port", async () => {
    const netRelay = createNetRelay();
    const server = fakeServerWorker((url) => ({ status: 200, statusMessage: "OK", body: `you asked for ${url}` }));
    server.setRelay(netRelay);
    netRelay.registerWorker("server-1", server as unknown as Worker);
    netRelay.listen("server-1", 3000);
    netRelay.pipeListen("server-1", "\u0000dwc-tcp:3000");

    const result = await fetchFromGuestServer(netRelay, 3000, "/hello");

    expect(result.status).toBe(200);
    expect(result.statusMessage).toBe("OK");
    expect(new TextDecoder().decode(result.body)).toBe("you asked for /hello");
  });

  it("rejects with ERR_PREVIEW_CONNECTION_REFUSED when nothing is listening on the port", async () => {
    const netRelay = createNetRelay();
    await expect(fetchFromGuestServer(netRelay, 9999, "/")).rejects.toMatchObject({ code: "ERR_PREVIEW_CONNECTION_REFUSED" });
  });

  it("rejects when the connection closes before a full response arrives", async () => {
    const netRelay = createNetRelay();
    const postMessage = (message: { type: string; payload: PipeRelayMessage }) => {
      if (message.type === "net-pipe-message" && message.payload.type === "pipe-open") {
        netRelay.relay("server-1", { type: "pipe-close", connId: message.payload.connId });
      }
    };
    netRelay.registerWorker("server-1", { postMessage } as unknown as Worker);
    netRelay.pipeListen("server-1", "\u0000dwc-tcp:4000");

    await expect(fetchFromGuestServer(netRelay, 4000, "/")).rejects.toThrow(/closed before a full response/);
  });

  it("sends the request method, headers, and body correctly (verified by decoding what the server actually received)", async () => {
    const netRelay = createNetRelay();
    let received: { method?: string; url?: string; headers: Record<string, unknown>; body: Uint8Array } | undefined;
    const requestParser = new HttpParser("request");
    const postMessage = (message: { type: string; payload: PipeRelayMessage }) => {
      if (message.type !== "net-pipe-message") return;
      const pipeMessage = message.payload;
      if (pipeMessage.type === "pipe-data" && pipeMessage.chunk) {
        const [request] = requestParser.execute(pipeMessage.chunk);
        if (request) {
          received = request;
          const body = new TextEncoder().encode("ok");
          netRelay.relay(
            "server-1",
            { type: "pipe-data", connId: pipeMessage.connId, chunk: serializeResponse(200, "OK", { "Content-Length": "2" }, body) },
          );
        }
      }
    };
    netRelay.registerWorker("server-1", { postMessage } as unknown as Worker);
    netRelay.pipeListen("server-1", "\u0000dwc-tcp:5000");

    const body = new TextEncoder().encode("payload");
    await fetchFromGuestServer(netRelay, 5000, "/submit", { method: "POST", headers: { "X-Test": "abc" }, body });

    expect(received?.method).toBe("POST");
    expect(received?.url).toBe("/submit");
    expect(received?.headers["x-test"]).toBe("abc");
    expect(received?.headers["content-length"]).toBe(String(body.length));
    expect(new TextDecoder().decode(received?.body)).toBe("payload");
  });
});

// Sanity check that serializeRequest/HttpParser really are the same
// wire format http.js's real Server class parses in the browser (this test
// only proves internal consistency between this file's own helpers).
describe("serializeRequest / HttpParser round-trip (sanity check for previewRelay's own wire format)", () => {
  it("round-trips a GET with custom headers", () => {
    const raw = serializeRequest("GET", "/x", { Host: "localhost", "X-A": "1" });
    const parser = new HttpParser("request");
    const [message] = parser.execute(raw);
    expect(message?.method).toBe("GET");
    expect(message?.headers.host).toBe("localhost");
  });
});
