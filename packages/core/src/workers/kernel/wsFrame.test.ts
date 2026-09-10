import { describe, expect, it } from "vitest";
import { WsFrameDecoder, decodeCloseFramePayload, encodeCloseFramePayload, encodeWsFrame } from "./wsFrame";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const randomMask = (): Uint8Array => crypto.getRandomValues(new Uint8Array(4));

// crypto.getRandomValues() refuses buffers over 65536 bytes in one call -
// fill in chunks for the larger boundary-length test cases.
const randomBytes = (length: number): Uint8Array => {
  const out = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += 65536) {
    crypto.getRandomValues(out.subarray(offset, Math.min(offset + 65536, length)));
  }
  return out;
};

describe("encodeWsFrame / WsFrameDecoder round-trip", () => {
  it.each([0, 1, 125, 126, 127, 65535, 65536, 70000])("round-trips a masked text frame of payload length %i", (length) => {
    const payload = randomBytes(length);
    const frame = encodeWsFrame("text", payload, randomMask());

    const decoder = new WsFrameDecoder();
    const [message] = decoder.push(frame);

    expect(message?.opcode).toBe("text");
    expect(message?.payload).toEqual(payload);
  });

  it("round-trips an unmasked frame (server role - real Vite's ws server never masks its own frames)", () => {
    const payload = enc("hello");
    const frame = encodeWsFrame("text", payload); // no mask
    const decoder = new WsFrameDecoder();
    const [message] = decoder.push(frame);

    expect(message?.opcode).toBe("text");
    expect(dec(message!.payload)).toBe("hello");
  });

  it("decodes a real JSON HMR-shaped text message end to end", () => {
    const json = JSON.stringify({ type: "update", updates: [{ path: "/src/App.jsx" }] });
    const frame = encodeWsFrame("text", enc(json));
    const decoder = new WsFrameDecoder();
    const [message] = decoder.push(frame);

    expect(JSON.parse(dec(message!.payload))).toEqual({ type: "update", updates: [{ path: "/src/App.jsx" }] });
  });

  it("feeds frame bytes split across multiple push() calls (byte-boundary fragmentation of the transport, not WS-level fragmentation)", () => {
    const payload = enc("split across chunks");
    const frame = encodeWsFrame("binary", payload, randomMask());
    const decoder = new WsFrameDecoder();

    const mid = Math.floor(frame.length / 2);
    expect(decoder.push(frame.subarray(0, mid))).toHaveLength(0);
    const messages = decoder.push(frame.subarray(mid));

    expect(messages).toHaveLength(1);
    expect(messages[0]!.opcode).toBe("binary");
    expect(dec(messages[0]!.payload)).toBe("split across chunks");
  });

  it("reassembles a WS-level fragmented message (continuation frames, FIN bit)", () => {
    // Real frame-level fragmentation: FIN=0 on the first frame (text
    // opcode), FIN=0 on middle continuation frames, FIN=1 on the last.
    const part1 = enc("hello ");
    const part2 = enc("frag");
    const part3 = enc("mented world");

    const first = encodeWsFrame("text", part1);
    first[0] = first[0]! & ~0x80; // clear FIN
    const middle = encodeWsFrame("continuation", part2);
    middle[0] = middle[0]! & ~0x80; // clear FIN
    const last = encodeWsFrame("continuation", part3); // FIN=1 (default)

    const decoder = new WsFrameDecoder();
    expect(decoder.push(first)).toHaveLength(0);
    expect(decoder.push(middle)).toHaveLength(0);
    const messages = decoder.push(last);

    expect(messages).toHaveLength(1);
    expect(messages[0]!.opcode).toBe("text");
    expect(dec(messages[0]!.payload)).toBe("hello fragmented world");
  });

  it("decodes multiple complete frames delivered in one chunk", () => {
    const frame1 = encodeWsFrame("text", enc("one"));
    const frame2 = encodeWsFrame("text", enc("two"));
    const combined = new Uint8Array(frame1.length + frame2.length);
    combined.set(frame1, 0);
    combined.set(frame2, frame1.length);

    const decoder = new WsFrameDecoder();
    const messages = decoder.push(combined);

    expect(messages).toHaveLength(2);
    expect(dec(messages[0]!.payload)).toBe("one");
    expect(dec(messages[1]!.payload)).toBe("two");
  });

  it("decodes ping and pong control frames", () => {
    const decoder = new WsFrameDecoder();
    const pingPayload = enc("ping-data");
    const [ping] = decoder.push(encodeWsFrame("ping", pingPayload));
    expect(ping?.opcode).toBe("ping");
    expect(dec(ping!.payload)).toBe("ping-data");

    const [pong] = decoder.push(encodeWsFrame("pong", new Uint8Array(0)));
    expect(pong?.opcode).toBe("pong");
    expect(pong?.payload).toHaveLength(0);
  });
});

describe("close frame payload codec", () => {
  it("round-trips a close code and reason", () => {
    const payload = encodeCloseFramePayload(1000, "normal closure");
    expect(decodeCloseFramePayload(payload)).toEqual({ code: 1000, reason: "normal closure" });
  });

  it("round-trips through a full close frame", () => {
    const payload = encodeCloseFramePayload(1001, "going away");
    const frame = encodeWsFrame("close", payload);
    const decoder = new WsFrameDecoder();
    const [message] = decoder.push(frame);

    expect(message?.opcode).toBe("close");
    expect(decodeCloseFramePayload(message!.payload)).toEqual({ code: 1001, reason: "going away" });
  });

  it("reports code 1005 for an empty close payload (no status received, per the WebSocket spec)", () => {
    expect(decodeCloseFramePayload(new Uint8Array(0))).toEqual({ code: 1005, reason: "" });
  });
});
