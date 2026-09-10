import { describe, expect, it } from "vitest";
import { createNodeModules } from "../loader";

const fakeProcess = () => ({
  env: {},
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
    queueMicrotask(() => callback(...args));
  },
});

interface ParsedMessage {
  method?: string;
  url?: string;
  httpVersion: string;
  statusCode?: number;
  statusMessage?: string;
  headers: Record<string, string | string[]>;
  body: Uint8Array;
}

interface HttpParser {
  execute(chunk: Uint8Array): ParsedMessage[];
  drainPending(): Uint8Array;
}

interface HttpParserModule {
  HttpParser: new (kind: "request" | "response") => HttpParser;
  serializeRequest(method: string, url: string, headers: Record<string, string | string[]>, body?: Uint8Array): Uint8Array;
  serializeResponse(statusCode: number, statusMessage: string, headers: Record<string, string | string[]>, body?: Uint8Array): Uint8Array;
}

const requireHttpParser = (): HttpParserModule => {
  const { require } = createNodeModules(fakeProcess());
  return require("internal/http_parser") as HttpParserModule;
};

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

describe("internal/http_parser HttpParser (request)", () => {
  it("parses a simple bodyless GET request", () => {
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("request");
    const messages = parser.execute(enc("GET /foo/bar HTTP/1.1\r\nHost: example.com\r\nAccept: */*\r\n\r\n"));

    expect(messages).toHaveLength(1);
    expect(messages[0].method).toBe("GET");
    expect(messages[0].url).toBe("/foo/bar");
    expect(messages[0].httpVersion).toBe("1.1");
    expect(messages[0].headers.host).toBe("example.com");
    expect(messages[0].body.length).toBe(0);
  });

  it("parses a request with a Content-Length body", () => {
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("request");
    const raw = "POST /submit HTTP/1.1\r\nHost: x\r\nContent-Length: 11\r\n\r\nhello world";
    const messages = parser.execute(enc(raw));

    expect(messages).toHaveLength(1);
    expect(messages[0].method).toBe("POST");
    expect(dec(messages[0].body)).toBe("hello world");
  });

  it("does not complete a message until the declared Content-Length has fully arrived, then completes once it has", () => {
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("request");
    const head = "POST /submit HTTP/1.1\r\nHost: x\r\nContent-Length: 11\r\n\r\n";

    expect(parser.execute(enc(head + "hello"))).toHaveLength(0);
    const messages = parser.execute(enc(" world"));
    expect(messages).toHaveLength(1);
    expect(dec(messages[0].body)).toBe("hello world");
  });

  it("parses a chunked-transfer-encoded body", () => {
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("request");
    const raw = "POST /submit HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n" + "5\r\nhello\r\n" + "6\r\n world\r\n" + "0\r\n\r\n";
    const messages = parser.execute(enc(raw));

    expect(messages).toHaveLength(1);
    expect(dec(messages[0].body)).toBe("hello world");
  });

  it("does not complete a chunked body until the terminating zero-length chunk arrives", () => {
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("request");
    const head = "POST /submit HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n";

    expect(parser.execute(enc(head + "5\r\nhello\r\n"))).toHaveLength(0);
    const messages = parser.execute(enc("0\r\n\r\n"));
    expect(messages).toHaveLength(1);
    expect(dec(messages[0].body)).toBe("hello");
  });

  it("returns multiple completed messages from a single execute() call when more than one is already buffered (keep-alive pipelining)", () => {
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("request");
    const first = "GET /a HTTP/1.1\r\nHost: x\r\n\r\n";
    const second = "GET /b HTTP/1.1\r\nHost: x\r\n\r\n";
    const messages = parser.execute(enc(first + second));

    expect(messages).toHaveLength(2);
    expect(messages[0].url).toBe("/a");
    expect(messages[1].url).toBe("/b");
  });

  it("lower-cases header names and joins repeated headers into an array", () => {
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("request");
    const raw = "GET / HTTP/1.1\r\nHost: x\r\nX-Thing: one\r\nX-Thing: two\r\n\r\n";
    const messages = parser.execute(enc(raw));

    expect(messages[0].headers["x-thing"]).toEqual(["one", "two"]);
  });
});

describe("internal/http_parser HttpParser (response)", () => {
  it("parses a status line and headers", () => {
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("response");
    const raw = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 2\r\n\r\nhi";
    const messages = parser.execute(enc(raw));

    expect(messages).toHaveLength(1);
    expect(messages[0].statusCode).toBe(200);
    expect(messages[0].statusMessage).toBe("OK");
    expect(dec(messages[0].body)).toBe("hi");
  });

  it("parses a non-200 status with no reason phrase", () => {
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("response");
    const messages = parser.execute(enc("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"));
    expect(messages[0].statusCode).toBe(404);
    expect(messages[0].statusMessage).toBe("Not Found");
  });
});

describe("internal/http_parser HttpParser drainPending", () => {
  it("returns empty bytes when nothing trails the most recently parsed message", () => {
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("response");
    const messages = parser.execute(enc("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nhi"));

    expect(messages).toHaveLength(1);
    expect(parser.drainPending()).toHaveLength(0);
  });

  it("recovers raw bytes stapled after a 101-shaped (no-body) response in the same chunk", () => {
    // A 101 Switching Protocols response has neither Content-Length nor
    // Transfer-Encoding, so the parser's "no declared body" branch treats
    // it as complete right after the header block - any bytes appended
    // after that in the same read (e.g. the first WebSocket frame,
    // flushed immediately after the handshake response) must be
    // recoverable via drainPending(), not silently dropped.
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("response");
    const head = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n";
    const trailing = new Uint8Array([0x81, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]); // a raw WS text frame, unrelated to HTTP framing

    const combined = new Uint8Array(enc(head).length + trailing.length);
    combined.set(enc(head), 0);
    combined.set(trailing, enc(head).length);

    const messages = parser.execute(combined);
    expect(messages).toHaveLength(1);
    expect(messages[0].statusCode).toBe(101);
    expect(messages[0].body).toHaveLength(0);

    expect(parser.drainPending()).toEqual(trailing);
    // draining clears it - a second call has nothing left to return.
    expect(parser.drainPending()).toHaveLength(0);
  });

  it("does not disturb subsequent execute() calls when drainPending() was never called", () => {
    const { HttpParser } = requireHttpParser();
    const parser = new HttpParser("request");
    expect(parser.execute(enc("GET /a HTTP/1.1\r\nHost: x\r\n\r\n"))).toHaveLength(1);
    expect(parser.execute(enc("GET /b HTTP/1.1\r\nHost: x\r\n\r\n"))).toHaveLength(1);
  });
});

describe("internal/http_parser serializeRequest/serializeResponse", () => {
  it("round-trips a serialized request back through the parser", () => {
    const { HttpParser, serializeRequest } = requireHttpParser();
    const raw = serializeRequest("GET", "/hello", { Host: "example.com", "X-Custom": "abc" });
    const parser = new HttpParser("request");
    const [message] = parser.execute(raw);

    expect(message.method).toBe("GET");
    expect(message.url).toBe("/hello");
    expect(message.headers.host).toBe("example.com");
    expect(message.headers["x-custom"]).toBe("abc");
  });

  it("round-trips a serialized request with a body, including a correct Content-Length", () => {
    const { HttpParser, serializeRequest } = requireHttpParser();
    const body = enc("hello world");
    const raw = serializeRequest("POST", "/submit", { Host: "x", "Content-Length": String(body.length) }, body);
    const parser = new HttpParser("request");
    const [message] = parser.execute(raw);

    expect(dec(message.body)).toBe("hello world");
  });

  it("round-trips a serialized response back through the parser", () => {
    const { HttpParser, serializeResponse } = requireHttpParser();
    const body = enc("hi");
    const raw = serializeResponse(200, "OK", { "Content-Type": "text/plain", "Content-Length": String(body.length) }, body);
    const parser = new HttpParser("response");
    const [message] = parser.execute(raw);

    expect(message.statusCode).toBe(200);
    expect(dec(message.body)).toBe("hi");
  });
});
