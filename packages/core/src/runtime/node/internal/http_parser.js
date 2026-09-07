// internal/http_parser — a pure-JS, incremental HTTP/1.1 message parser.
//
// Real Node's HTTP parsing is NOT pure JS: `_http_server.js`/`_http_client.js`
// hand raw socket bytes to `llhttp`, a C parser compiled into the native
// binary (reached via `internalBinding('http_parser')`). There is no such
// binding here, and unlike `net`/`dns`/`tls` (which only needed a JS
// reimplementation of the *transport*, not the wire format itself), HTTP's
// own framing genuinely has no vendorable pure-JS source in real Node to
// copy - so this is a hand-written parser, the same category of work as
// zlib's own from-scratch DEFLATE decoder (internal/inflate.js).
//
// Scope, matching that same "traced need, not speculative completeness"
// philosophy: HTTP/1.1 request- and status-lines, headers, and exactly the
// two real body-framing modes worth supporting for an in-VM dev server -
// `Content-Length` and `Transfer-Encoding: chunked` - plus "no body" and
// "read until the connection closes" (the HTTP/1.0-ish fallback). No
// pipelining beyond "more than one message may already be buffered when
// `execute()` is called" (handled: `execute()` returns every message it can
// fully parse from what's been pushed so far, one array per call, keeping
// any incomplete trailing bytes buffered for the next call). No HTTP/2,
// no trailers, no `Expect: 100-continue`.
export default function (exports, require, module) {
  "use strict";

  const CR = 0x0d;
  const LF = 0x0a;

  const concatBytes = (chunks) => {
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
  const findHeaderEnd = (bytes, from) => {
    for (let i = from; i + 3 < bytes.length; i++) {
      if (bytes[i] === CR && bytes[i + 1] === LF && bytes[i + 2] === CR && bytes[i + 3] === LF) return i;
    }
    return -1;
  };

  /** Index of the next `\r\n` at or after `from`, or -1. */
  const findCRLF = (bytes, from) => {
    for (let i = from; i + 1 < bytes.length; i++) {
      if (bytes[i] === CR && bytes[i + 1] === LF) return i;
    }
    return -1;
  };

  const decoder = new TextDecoder("latin1"); // header bytes are always ASCII/Latin-1 per RFC 7230

  const parseHeaderBlock = (bytes, headerEnd) => {
    const text = decoder.decode(bytes.subarray(0, headerEnd));
    const lines = text.split("\r\n");
    const startLine = lines[0];
    const headers = {};
    const rawHeaders = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const name = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      rawHeaders.push(name, value);
      const key = name.toLowerCase();
      if (key in headers) {
        headers[key] = Array.isArray(headers[key]) ? [...headers[key], value] : [headers[key], value];
      } else {
        headers[key] = value;
      }
    }
    return { startLine, headers, rawHeaders };
  };

  const parseRequestLine = (startLine) => {
    const parts = startLine.split(" ");
    if (parts.length !== 3) throw new Error(`invalid HTTP request line: ${JSON.stringify(startLine)}`);
    const [method, url, httpVersion] = parts;
    return { method, url, httpVersion: httpVersion.replace(/^HTTP\//, "") };
  };

  const parseStatusLine = (startLine) => {
    const match = /^HTTP\/(\d\.\d) (\d\d\d) ?(.*)$/.exec(startLine);
    if (!match) throw new Error(`invalid HTTP status line: ${JSON.stringify(startLine)}`);
    return { httpVersion: match[1], statusCode: Number(match[2]), statusMessage: match[3] };
  };

  /** One parser instance per connection direction (`kind`: 'request' for a
   * server reading requests, 'response' for a client reading responses).
   * `execute(chunk)` feeds newly-arrived bytes and returns every message
   * fully parsed so far (usually 0 or 1; more if several were already
   * buffered - e.g. a client that pipelines, or a slow consumer). */
  class HttpParser {
    constructor(kind) {
      this.kind = kind;
      this._pending = [];
      this._pendingLength = 0;
    }

    execute(chunk) {
      if (chunk && chunk.length > 0) {
        this._pending.push(chunk);
        this._pendingLength += chunk.length;
      }
      const messages = [];
      for (;;) {
        const bytes = this._pending.length > 1 ? concatBytes(this._pending) : (this._pending[0] ?? new Uint8Array(0));
        const result = this._tryParseOne(bytes);
        if (!result) {
          this._pending = bytes.length > 0 ? [bytes] : [];
          this._pendingLength = bytes.length;
          break;
        }
        messages.push(result.message);
        const rest = bytes.subarray(result.bytesConsumed);
        this._pending = rest.length > 0 ? [rest] : [];
        this._pendingLength = rest.length;
        if (rest.length === 0) break;
      }
      return messages;
    }

    /** True once no more messages can arrive on this connection (only
     * meaningful for the "read until close" body-framing fallback, which a
     * caller resolves by calling `finish()` when its underlying socket
     * ends). */
    finish() {
      if (this._pendingLength === 0) return null;
      const bytes = concatBytes(this._pending);
      this._pending = [];
      this._pendingLength = 0;
      return { headBytesOrBody: bytes };
    }

    _tryParseOne(bytes) {
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

      // No declared body ("no body" for a bodyless request/response, e.g.
      // GET or a 204). A response with neither header AND no declared
      // length in the real HTTP/1.0 "read until close" sense is NOT
      // resolved here - the caller must call `finish()` once its socket
      // ends, since this parser has no visibility into that on its own.
      return { message: { ...meta, headers, rawHeaders, body: new Uint8Array(0) }, bytesConsumed: bodyStart };
    }

    _readChunkedBody(bytes, from) {
      const chunks = [];
      let pos = from;
      for (;;) {
        const lineEnd = findCRLF(bytes, pos);
        if (lineEnd === -1) return null;
        const sizeLine = decoder.decode(bytes.subarray(pos, lineEnd)).split(";")[0].trim();
        const size = Number.parseInt(sizeLine, 16);
        if (Number.isNaN(size)) throw new Error(`invalid chunk size: ${JSON.stringify(sizeLine)}`);
        const chunkDataStart = lineEnd + 2;
        if (size === 0) {
          // final chunk - optional trailers, then a terminating CRLF
          const trailerEnd = findHeaderEnd(bytes, chunkDataStart - 2);
          if (trailerEnd !== -1) {
            return { body: concatBytes(chunks), bytesConsumed: trailerEnd + 4 };
          }
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

  /** Serializes {method, url, headers} (+ optional body) into a raw HTTP/1.1
   * request. `headers` values may be a string or array of strings (for
   * repeated headers, e.g. Set-Cookie-shaped semantics on the request
   * side). */
  const serializeRequest = (method, url, headers, body) => {
    const lines = [`${method} ${url} HTTP/1.1`];
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

  /** Serializes {statusCode, statusMessage, headers} (+ optional body) into
   * a raw HTTP/1.1 response. */
  const serializeResponse = (statusCode, statusMessage, headers, body) => {
    const lines = [`HTTP/1.1 ${statusCode} ${statusMessage || ""}`.trimEnd()];
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

  module.exports = { HttpParser, serializeRequest, serializeResponse };
}
