// wsFrame — a minimal, pure RFC 6455 (WebSocket) frame codec, used only by
// the KERNEL's own WS *client* role (workers/kernel/previewSocket.ts, which
// dials into a guest's http.createServer() the same way previewRelay.ts's
// fetchFromGuestServer does for plain HTTP). The guest side never needs
// this: real Vite's own bundled dev server already vendors a complete
// `ws`-shaped WebSocketServer that does all SERVER-side framing itself,
// running as ordinary guest JS on top of this runtime's own real,
// persistent net.Socket (see runtime/node/lib/http.js's 'upgrade' event).
//
// Scope, matching this codebase's "traced need, not speculative
// completeness" philosophy (same spirit as httpWireFormat.ts's own doc
// comment):
//  - Text, binary, close, ping, and pong opcodes. No reserved-bit/extension
//    support (permessage-deflate is deliberately never negotiated by
//    previewSocket.ts's handshake request, so a compliant server never
//    enables it for this connection - nothing here needs to decode it).
//  - Decode reassembles fragmented messages (continuation frames via the
//    FIN bit) - real WS servers can fragment large messages, so dropping
//    this would be a silent data-loss class, not just an edge case.
//  - Encode never fragments - every message this runtime ever sends
//    (Vite HMR client acks, pings) is small.
//  - Masking: RFC 6455 §5.1 requires every client-to-server frame to carry
//    a real mask, and a compliant server (real Vite's bundled `ws`) rejects
//    an unmasked one outright - not a defensive nicety, a hard protocol
//    requirement for encode. Decode unmasks if the (spec-violating, for a
//    server) masked bit happens to be set, since honoring it costs nothing
//    and avoids a silent-corruption class if some server implementation
//    ever does.

type WsOpcode = "continuation" | "text" | "binary" | "close" | "ping" | "pong";
type WsMessageOpcode = "text" | "binary" | "close" | "ping" | "pong";

interface WsDecodedMessage {
  opcode: WsMessageOpcode;
  payload: Uint8Array;
}

const OPCODE_TO_BYTE: Record<WsOpcode, number> = {
  continuation: 0x0,
  text: 0x1,
  binary: 0x2,
  close: 0x8,
  ping: 0x9,
  pong: 0xa,
};

const BYTE_TO_OPCODE: Record<number, WsOpcode> = {
  0x0: "continuation",
  0x1: "text",
  0x2: "binary",
  0x8: "close",
  0x9: "ping",
  0xa: "pong",
};

/** Encodes one complete, unfragmented frame (FIN=1). `mask`, when given,
 * MUST be a 4-byte key - every host->guest frame needs one (see file doc
 * comment); omit only when encoding a frame this codec itself will never
 * send masked (not currently exercised - encode always masks in practice). */
const encodeWsFrame = (opcode: WsOpcode, payload: Uint8Array, mask?: Uint8Array): Uint8Array => {
  const masked = !!mask;
  const len = payload.length;

  let headerLen = 2;
  if (len >= 65536) headerLen += 8;
  else if (len >= 126) headerLen += 2;
  if (masked) headerLen += 4;

  const out = new Uint8Array(headerLen + len);
  out[0] = 0x80 | OPCODE_TO_BYTE[opcode]; // FIN=1, no extension bits, opcode
  let offset = 2;

  if (len >= 65536) {
    out[1] = masked ? 0x80 | 127 : 127;
    const view = new DataView(out.buffer, out.byteOffset + 2, 8);
    view.setUint32(0, 0); // payload lengths here never exceed 32 bits
    view.setUint32(4, len);
    offset = 10;
  } else if (len >= 126) {
    out[1] = masked ? 0x80 | 126 : 126;
    new DataView(out.buffer, out.byteOffset + 2, 2).setUint16(0, len);
    offset = 4;
  } else {
    out[1] = masked ? 0x80 | len : len;
  }

  if (masked) {
    out.set(mask, offset);
    for (let i = 0; i < len; i++) out[offset + 4 + i] = payload[i]! ^ mask[i % 4]!;
    offset += 4;
  } else {
    out.set(payload, offset);
  }

  return out;
};

/** Encodes a close frame's payload (a 2-byte big-endian status code
 * followed by a UTF-8 reason string) - pass the result to
 * `encodeWsFrame("close", ...)`. */
const encodeCloseFramePayload = (code: number, reason: string): Uint8Array => {
  const reasonBytes = new TextEncoder().encode(reason);
  const out = new Uint8Array(2 + reasonBytes.length);
  new DataView(out.buffer).setUint16(0, code);
  out.set(reasonBytes, 2);
  return out;
};

/** Decodes a close frame's payload back into `{code, reason}`. A missing or
 * truncated code (fewer than 2 bytes - a peer may send an empty close
 * frame) is reported as 1005 ("no status received"), matching the code the
 * WHATWG WebSocket spec itself uses for exactly this case. */
const decodeCloseFramePayload = (payload: Uint8Array): { code: number; reason: string } => {
  if (payload.length < 2) return { code: 1005, reason: "" };
  const code = new DataView(payload.buffer, payload.byteOffset, 2).getUint16(0);
  const reason = new TextDecoder().decode(payload.subarray(2));
  return { code, reason };
};

interface RawFrame {
  fin: boolean;
  opcode: WsOpcode;
  payload: Uint8Array;
  bytesConsumed: number;
}

/** Parses at most one frame header+payload from the front of `bytes`, or
 * `null` if not enough has arrived yet. */
const tryParseOneFrame = (bytes: Uint8Array): RawFrame | null => {
  if (bytes.length < 2) return null;
  const fin = (bytes[0]! & 0x80) !== 0;
  const opcodeByte = bytes[0]! & 0x0f;
  const opcode = BYTE_TO_OPCODE[opcodeByte];
  if (opcode === undefined) throw new Error(`unsupported WebSocket opcode: 0x${opcodeByte.toString(16)}`);

  const masked = (bytes[1]! & 0x80) !== 0;
  let len = bytes[1]! & 0x7f;
  let offset = 2;

  if (len === 126) {
    if (bytes.length < offset + 2) return null;
    len = new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0);
    offset += 2;
  } else if (len === 127) {
    if (bytes.length < offset + 8) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    len = view.getUint32(0) * 2 ** 32 + view.getUint32(4);
    offset += 8;
  }

  let mask: Uint8Array | null = null;
  if (masked) {
    if (bytes.length < offset + 4) return null;
    mask = bytes.subarray(offset, offset + 4);
    offset += 4;
  }

  if (bytes.length < offset + len) return null;
  let payload = bytes.subarray(offset, offset + len);
  if (mask) {
    const unmasked = new Uint8Array(len);
    for (let i = 0; i < len; i++) unmasked[i] = payload[i]! ^ mask[i % 4]!;
    payload = unmasked;
  }

  return { fin, opcode, payload, bytesConsumed: offset + len };
};

/** Incremental RFC 6455 decoder, one instance per connection. Reassembles
 * fragmented messages (continuation frames) into complete `text`/`binary`
 * messages; control frames (`close`/`ping`/`pong`) are always unfragmented
 * per spec and surface immediately. */
class WsFrameDecoder {
  private _pending: Uint8Array = new Uint8Array(0);
  private _fragmentOpcode: "text" | "binary" | null = null;
  private _fragments: Uint8Array[] = [];

  push(chunk: Uint8Array): WsDecodedMessage[] {
    if (chunk.length > 0) {
      const combined = new Uint8Array(this._pending.length + chunk.length);
      combined.set(this._pending, 0);
      combined.set(chunk, this._pending.length);
      this._pending = combined;
    }

    const messages: WsDecodedMessage[] = [];
    for (;;) {
      const frame = tryParseOneFrame(this._pending);
      if (!frame) break;
      this._pending = this._pending.subarray(frame.bytesConsumed);

      if (frame.opcode === "close" || frame.opcode === "ping" || frame.opcode === "pong") {
        messages.push({ opcode: frame.opcode, payload: frame.payload });
        continue;
      }

      if (frame.opcode === "text" || frame.opcode === "binary") {
        if (frame.fin) {
          messages.push({ opcode: frame.opcode, payload: frame.payload });
        } else {
          this._fragmentOpcode = frame.opcode;
          this._fragments = [frame.payload];
        }
        continue;
      }

      // continuation
      if (this._fragmentOpcode) {
        this._fragments.push(frame.payload);
        if (frame.fin) {
          let total = 0;
          for (const f of this._fragments) total += f.length;
          const combined = new Uint8Array(total);
          let off = 0;
          for (const f of this._fragments) {
            combined.set(f, off);
            off += f.length;
          }
          messages.push({ opcode: this._fragmentOpcode, payload: combined });
          this._fragmentOpcode = null;
          this._fragments = [];
        }
      }
    }
    return messages;
  }
}

export { WsFrameDecoder, decodeCloseFramePayload, encodeCloseFramePayload, encodeWsFrame };
export type { WsDecodedMessage, WsMessageOpcode, WsOpcode };
