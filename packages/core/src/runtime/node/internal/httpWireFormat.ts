// A pure-JS/TS, incremental HTTP/1.1 message parser plus request/response
// serializers - the shared implementation behind BOTH:
//   - internal/http_parser.js's guest-loadable factory wrapper (real Node's
//     own HTTP parsing isn't pure JS - `_http_server.js`/`_http_client.js`
//     hand raw bytes to `llhttp`, a native binding - so there's no
//     equivalent to vendor verbatim the way net.js/dns.js/tls.js were; this
//     is a hand-written parser, the same category of work as zlib's own
//     from-scratch DEFLATE decoder, internal/inflate.js).
//   - workers/kernel/previewRelay.ts, which speaks the exact same wire
//     format directly (no guest process involved) when the KERNEL itself
//     dials into a guest's http.createServer() on the host page's behalf
//     for the dev-server preview feature.
// Kept in one place, imported both ways, rather than duplicated, since it's
// the same algorithm serving both call sites.
//
// Scope, matching the "traced need, not speculative completeness"
// philosophy: HTTP/1.1 request- and status-lines, headers, and exactly the
// two real body-framing modes worth supporting for an in-VM dev server -
// `Content-Length` and `Transfer-Encoding: chunked` - plus "no body". No
// pipelining beyond "more than one message may already be buffered when
// `execute()` is called" (handled: `execute()` returns every message it can
// fully parse from what's been pushed so far, one array per call, keeping
// any incomplete trailing bytes buffered for the next call). No HTTP/2, no
// trailers, no `Expect: 100-continue`.

const CR = 0x0d;
const LF = 0x0a;

type HeaderValue = string | string[];
type Headers = Record<string, HeaderValue>;

interface ParsedMessage {
  method?: string;
  url?: string;
  httpVersion: string;
  statusCode?: number;
  statusMessage?: string;
  headers: Headers;
  rawHeaders: string[];
  body: Uint8Array;
}

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
};

/** Index of the first `\r\n\r\n` (the end of the header block) at or after
 * `from`, or -1 if not present yet. */
const findHeaderEnd = (bytes: Uint8Array, from: number): number => {
  for (let i = from; i + 3 < bytes.length; i++) {
    if (bytes[i] === CR && bytes[i + 1] === LF && bytes[i + 2] === CR && bytes[i + 3] === LF) return i;
  }
  return -1;
};

/** Index of the next `\r\n` at or after `from`, or -1. */
const findCRLF = (bytes: Uint8Array, from: number): number => {
  for (let i = from; i + 1 < bytes.length; i++) {
    if (bytes[i] === CR && bytes[i + 1] === LF) return i;
  }
  return -1;
};

const decoder = new TextDecoder("latin1"); // header bytes are always ASCII/Latin-1 per RFC 7230

const parseHeaderBlock = (bytes: Uint8Array, headerEnd: number): { startLine: string; headers: Headers; rawHeaders: string[] } => {
  const text = decoder.decode(bytes.subarray(0, headerEnd));
  const lines = text.split("\r\n");
  const startLine = lines[0]!;
  const headers: Headers = {};
  const rawHeaders: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    rawHeaders.push(name, value);
    const key = name.toLowerCase();
    const existing = headers[key];
    if (existing !== undefined) {
      headers[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      headers[key] = value;
    }
  }
  return { startLine, headers, rawHeaders };
};

const parseRequestLine = (startLine: string): { method: string; url: string; httpVersion: string } => {
  const parts = startLine.split(" ");
  if (parts.length !== 3) throw new Error(`invalid HTTP request line: ${JSON.stringify(startLine)}`);
  const [method, url, httpVersion] = parts as [string, string, string];
  return { method, url, httpVersion: httpVersion.replace(/^HTTP\//, "") };
};

const parseStatusLine = (startLine: string): { httpVersion: string; statusCode: number; statusMessage: string } => {
  const match = /^HTTP\/(\d\.\d) (\d\d\d) ?(.*)$/.exec(startLine);
  if (!match) throw new Error(`invalid HTTP status line: ${JSON.stringify(startLine)}`);
  return { httpVersion: match[1]!, statusCode: Number(match[2]), statusMessage: match[3]! };
};

interface ParseOneResult {
  message: ParsedMessage;
  bytesConsumed: number;
}

/** One parser instance per connection direction (`kind`: 'request' for a
 * server reading requests, 'response' for a client reading responses).
 * `execute(chunk)` feeds newly-arrived bytes and returns every message
 * fully parsed so far (usually 0 or 1; more if several were already
 * buffered - e.g. a client that pipelines, or a slow consumer). */
class HttpParser {
  readonly kind: "request" | "response";
  private _pending: Uint8Array[] = [];

  constructor(kind: "request" | "response") {
    this.kind = kind;
  }

  execute(chunk: Uint8Array | null | undefined): ParsedMessage[] {
    if (chunk && chunk.length > 0) this._pending.push(chunk);
    const messages: ParsedMessage[] = [];
    for (;;) {
      const bytes = this._pending.length > 1 ? concatBytes(this._pending) : (this._pending[0] ?? new Uint8Array(0));
      const result = this._tryParseOne(bytes);
      if (!result) {
        this._pending = bytes.length > 0 ? [bytes] : [];
        break;
      }
      messages.push(result.message);
      const rest = bytes.subarray(result.bytesConsumed);
      this._pending = rest.length > 0 ? [rest] : [];
      if (rest.length === 0) break;
    }
    return messages;
  }

  private _tryParseOne(bytes: Uint8Array): ParseOneResult | null {
    const headerEnd = findHeaderEnd(bytes, 0);
    if (headerEnd === -1) return null;
    const { startLine, headers, rawHeaders } = parseHeaderBlock(bytes, headerEnd);
    const meta = this.kind === "request" ? parseRequestLine(startLine) : parseStatusLine(startLine);
    const bodyStart = headerEnd + 4;

    const transferEncoding = String(headers["transfer-encoding"] || "").toLowerCase();
    const isChunked = transferEncoding.includes("chunked");
    const contentLength = "content-length" in headers ? Number(headers["content-length"]) : null;

    if (isChunked) {
      const chunkResult = this._readChunkedBody(bytes, bodyStart);
      if (!chunkResult) return null;
      return {
        message: { ...meta, headers, rawHeaders, body: chunkResult.body },
        bytesConsumed: chunkResult.bytesConsumed,
      };
    }

    if (contentLength !== null) {
      if (bytes.length - bodyStart < contentLength) return null;
      return {
        message: { ...meta, headers, rawHeaders, body: bytes.subarray(bodyStart, bodyStart + contentLength) },
        bytesConsumed: bodyStart + contentLength,
      };
    }

    // No declared body (a bodyless request/response, e.g. GET or a 204).
    return { message: { ...meta, headers, rawHeaders, body: new Uint8Array(0) }, bytesConsumed: bodyStart };
  }

  private _readChunkedBody(bytes: Uint8Array, from: number): { body: Uint8Array; bytesConsumed: number } | null {
    const chunks: Uint8Array[] = [];
    let pos = from;
    for (;;) {
      const lineEnd = findCRLF(bytes, pos);
      if (lineEnd === -1) return null;
      const sizeLine = decoder.decode(bytes.subarray(pos, lineEnd)).split(";")[0]!.trim();
      const size = Number.parseInt(sizeLine, 16);
      if (Number.isNaN(size)) throw new Error(`invalid chunk size: ${JSON.stringify(sizeLine)}`);
      const chunkDataStart = lineEnd + 2;
      if (size === 0) {
        // final chunk - optional trailers, then a terminating CRLF
        const trailerEnd = findHeaderEnd(bytes, chunkDataStart - 2);
        if (trailerEnd !== -1) return { body: concatBytes(chunks), bytesConsumed: trailerEnd + 4 };
        const terminator = findCRLF(bytes, chunkDataStart);
        if (terminator === -1) return null;
        return { body: concatBytes(chunks), bytesConsumed: terminator + 2 };
      }
      const chunkDataEnd = chunkDataStart + size;
      if (bytes.length < chunkDataEnd + 2) return null;
      chunks.push(bytes.subarray(chunkDataStart, chunkDataEnd));
      pos = chunkDataEnd + 2; // skip the chunk's own trailing CRLF
    }
  }
}

const serializeHead = (firstLine: string, headers: Headers | undefined, body: Uint8Array | undefined): Uint8Array => {
  const lines = [firstLine];
  for (const [name, value] of Object.entries(headers || {})) {
    for (const v of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${v}`);
  }
  lines.push("", "");
  const head = new TextEncoder().encode(lines.join("\r\n"));
  if (!body || body.length === 0) return head;
  const out = new Uint8Array(head.length + body.length);
  out.set(head);
  out.set(body, head.length);
  return out;
};

/** Serializes {method, url, headers} (+ optional body) into a raw HTTP/1.1
 * request. `headers` values may be a string or array of strings (for
 * repeated headers). */
const serializeRequest = (method: string, url: string, headers?: Headers, body?: Uint8Array): Uint8Array =>
  serializeHead(`${method} ${url} HTTP/1.1`, headers, body);

/** Serializes {statusCode, statusMessage, headers} (+ optional body) into a
 * raw HTTP/1.1 response. */
const serializeResponse = (statusCode: number, statusMessage: string | undefined, headers?: Headers, body?: Uint8Array): Uint8Array =>
  serializeHead(`HTTP/1.1 ${statusCode} ${statusMessage || ""}`.trimEnd(), headers, body);

export { HttpParser, serializeRequest, serializeResponse };
export type { Headers, HeaderValue, ParsedMessage };
