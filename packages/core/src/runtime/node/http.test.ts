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
