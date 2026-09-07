import { afterEach, describe, expect, it, vi } from "vitest";
import { createNodeModules } from "./loader";

const fakeProcess = () => ({
  env: {},
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
    queueMicrotask(() => callback(...args));
  },
});

afterEach(() => {
  delete (globalThis as any).__dwcFetchAsync;
});

describe("vendored 'https'/'http' (fetch-backed client)", () => {
  it("performs a GET through the __dwcFetchAsync bridge and delivers a real IncomingMessage-shaped response", async () => {
    (globalThis as any).__dwcFetchAsync = vi.fn(async (url: string, init: { method: string }) => {
      expect(url).toBe("https://registry.npmjs.org/left-pad");
      expect(init.method).toBe("GET");
      return {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        bodyBytes: new TextEncoder().encode('{"name":"left-pad"}'),
      };
    });

    const { require } = createNodeModules(fakeProcess());
    const https = require("https") as {
      get(url: string, cb: (res: any) => void): any;
    };

    const body: string = await new Promise((resolve, reject) => {
      https.get("https://registry.npmjs.org/left-pad", (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toBe("application/json");
        let data = "";
        res.on("data", (chunk: { toString(): string }) => (data += chunk.toString()));
        res.on("end", () => resolve(data));
        res.on("error", reject);
      });
    });

    expect(JSON.parse(body)).toEqual({ name: "left-pad" });
  });

  it("sends a POST body and custom headers through the bridge", async () => {
    const seen: any[] = [];
    (globalThis as any).__dwcFetchAsync = vi.fn(async (url: string, init: any) => {
      seen.push({ url, init });
      return { status: 201, statusText: "Created", headers: {}, bodyBytes: new Uint8Array() };
    });

    const { require } = createNodeModules(fakeProcess());
    const https = require("https") as {
      request(url: string, options: any, cb: (res: any) => void): any;
    };

    await new Promise<void>((resolve, reject) => {
      const req = https.request(
        "https://example.com/items",
        { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer x" } },
        (res: any) => {
          res.on("data", () => {});
          res.on("end", resolve);
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ a: 1 }));
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://example.com/items");
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.headers.authorization).toBe("Bearer x");
    expect(seen[0].init.body.toString()).toBe(JSON.stringify({ a: 1 }));
  });

  it("emits a clear error when no fetch bridge is available", async () => {
    const { require } = createNodeModules(fakeProcess());
    const https = require("https") as { get(url: string, cb: (res: any) => void): any };

    const error: Error = await new Promise((resolve) => {
      const req = https.get("https://example.com/", () => {});
      req.on("error", resolve);
    });

    expect((error as any).code).toBe("ENETUNREACH");
  });

  it("routes 'http' through the same fetch-backed transport", async () => {
    (globalThis as any).__dwcFetchAsync = vi.fn(async () => ({
      status: 200,
      statusText: "OK",
      headers: {},
      bodyBytes: new Uint8Array(),
    }));

    const { require } = createNodeModules(fakeProcess());
    const http = require("http") as { get(url: string, cb: (res: any) => void): any };

    await new Promise<void>((resolve, reject) => {
      const req = http.get("http://example.com/", (res: any) => {
        expect(res.statusCode).toBe(200);
        res.on("data", () => {});
        res.on("end", resolve);
        res.on("error", reject);
      });
      req.on("error", reject);
    });
  });

  it("exposes STATUS_CODES on 'http' (real npm's own minipass-fetch reads it even for an https:// request)", () => {
    const { require } = createNodeModules(fakeProcess());
    const http = require("http") as { STATUS_CODES: Record<number, string> };

    expect(http.STATUS_CODES[200]).toBe("OK");
    expect(http.STATUS_CODES[404]).toBe("Not Found");
    expect(http.STATUS_CODES[500]).toBe("Internal Server Error");
  });

  it("fails loudly on a protocol upgrade instead of hanging", async () => {
    (globalThis as any).__dwcFetchAsync = vi.fn();
    const { require } = createNodeModules(fakeProcess());
    const https = require("https") as { request(url: string, options: any): any };

    const error: Error = await new Promise((resolve) => {
      const req = https.request("https://example.com/ws", { headers: { upgrade: "websocket" } });
      req.on("error", resolve);
      req.end();
    });

    expect((error as any).code).toBe("ERR_DWC_UPGRADE_UNSUPPORTED");
  });
});

// http.createServer() is new: real npm's own dependency tree never needed
// an in-VM HTTP server, but an in-VM dev server (e.g. Vite, for the
// StackBlitz/vivari-style "preview" feature this unblocks) does. It runs on
// top of this runtime's own real, vendored `net` module (already working,
// same-process and cross-process) plus a hand-written HTTP/1.1 parser
// (internal/http_parser.js) - real Node's own server-side parsing isn't
// pure JS (it hands bytes to `llhttp`, a native binding), so there's
// nothing to vendor verbatim the way net.js/dns.js/tls.js were.
describe("vendored 'http' Server (real net.js underneath, real HTTP/1.1 wire format)", () => {
  it("round-trips a bodyless GET request end-to-end through a real net socket", async () => {
    const { require } = createNodeModules(fakeProcess());
    const http = require("http") as {
      createServer(handler: (req: any, res: any) => void): { listen(port: number, cb?: () => void): unknown; close(): unknown };
    };
    const net = require("net") as { connect(port: number, cb?: () => void): any };

    const server = http.createServer((req: any, res: any) => {
      expect(req.method).toBe("GET");
      expect(req.url).toBe("/hello");
      expect(req.headers.host).toBe("localhost");
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("hi there");
    });
    await new Promise<void>((resolve) => server.listen(3000, resolve));

    const response: string = await new Promise((resolve, reject) => {
      const socket = net.connect(3000, () => {
        socket.write("GET /hello HTTP/1.1\r\nHost: localhost\r\n\r\n");
      });
      let data = "";
      socket.on("data", (chunk: { toString(): string }) => (data += chunk.toString()));
      socket.on("end", () => resolve(data));
      socket.on("error", reject);
    });

    expect(response).toMatch(/^HTTP\/1\.1 200 OK/);
    // header names come back lowercased (this server always stores/emits
    // them that way - spec-compliant, since HTTP header names are
    // case-insensitive, just not byte-identical to what setHeader() was
    // called with).
    expect(response).toContain("content-type: text/plain");
    expect(response).toContain("hi there");
    server.close();
  });

  it("delivers a request body to the handler via req's real Readable interface", async () => {
    const { require } = createNodeModules(fakeProcess());
    const http = require("http") as {
      createServer(handler: (req: any, res: any) => void): { listen(port: number, cb?: () => void): unknown; close(): unknown };
    };
    const net = require("net") as { connect(port: number, cb?: () => void): any };
    const { Buffer } = require("buffer") as { Buffer: { concat(chunks: unknown[]): { toString(): string } } };

    const server = http.createServer((req: any, res: any) => {
      const chunks: unknown[] = [];
      req.on("data", (chunk: unknown) => chunks.push(chunk));
      req.on("end", () => {
        res.end(`echo:${Buffer.concat(chunks).toString()}`);
      });
    });
    await new Promise<void>((resolve) => server.listen(3001, resolve));

    const body = "hello world";
    const response: string = await new Promise((resolve, reject) => {
      const socket = net.connect(3001, () => {
        socket.write(`POST /echo HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
      });
      let data = "";
      socket.on("data", (chunk: { toString(): string }) => (data += chunk.toString()));
      socket.on("end", () => resolve(data));
      socket.on("error", reject);
    });

    expect(response).toContain("echo:hello world");
    server.close();
  });

  it("computes Content-Length automatically and closes the connection after one response", async () => {
    const { require } = createNodeModules(fakeProcess());
    const http = require("http") as {
      createServer(handler: (req: any, res: any) => void): { listen(port: number, cb?: () => void): unknown; close(): unknown };
    };
    const net = require("net") as { connect(port: number, cb?: () => void): any };

    const server = http.createServer((_req: any, res: any) => {
      res.write("part1 ");
      res.write("part2");
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(3002, resolve));

    const response: string = await new Promise((resolve, reject) => {
      const socket = net.connect(3002, () => {
        socket.write("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n");
      });
      let data = "";
      socket.on("data", (chunk: { toString(): string }) => (data += chunk.toString()));
      socket.on("end", () => resolve(data));
      socket.on("error", reject);
    });

    expect(response).toContain("content-length: 11");
    expect(response).toContain("connection: close");
    expect(response).toContain("part1 part2");
    server.close();
  });

  it("handles multiple sequential requests on the same server (new connection per request)", async () => {
    const { require } = createNodeModules(fakeProcess());
    const http = require("http") as {
      createServer(handler: (req: any, res: any) => void): { listen(port: number, cb?: () => void): unknown; close(): unknown };
    };
    const net = require("net") as { connect(port: number, cb?: () => void): any };

    let count = 0;
    const server = http.createServer((_req: any, res: any) => {
      count++;
      res.end(`response ${count}`);
    });
    await new Promise<void>((resolve) => server.listen(3003, resolve));

    const doRequest = (): Promise<string> =>
      new Promise((resolve, reject) => {
        const socket = net.connect(3003, () => {
          socket.write("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n");
        });
        let data = "";
        socket.on("data", (chunk: { toString(): string }) => (data += chunk.toString()));
        socket.on("end", () => resolve(data));
        socket.on("error", reject);
      });

    const first = await doRequest();
    const second = await doRequest();
    expect(first).toContain("response 1");
    expect(second).toContain("response 2");
    server.close();
  });
});
