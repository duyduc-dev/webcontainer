import { describe, expect, it } from "vitest";
import { createNodeModules } from "./loader";

// Node's process.nextTick(callback, ...args) forwards args to the callback —
// unlike queueMicrotask(callback), which takes none. The vendored stream
// internals rely on that forwarding (e.g. `nextTick(resume_, stream, state)`).
const fakeProcess = () => ({
  env: {},
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
    queueMicrotask(() => callback(...args));
  },
});

describe("vendored Node builtins (events + stream) via the factory loader", () => {
  it("resolves 'events' and runs a real EventEmitter", () => {
    const { require } = createNodeModules(fakeProcess());
    const { EventEmitter } = require("events") as { EventEmitter: new () => any };

    const emitter = new EventEmitter();
    const received: unknown[] = [];
    emitter.on("data", (value: unknown) => received.push(value));
    emitter.emit("data", 42);

    expect(received).toEqual([42]);
  });

  it("resolves 'stream' and pipes a Readable into a Writable", async () => {
    const { require } = createNodeModules(fakeProcess());
    const { Readable, Writable } = require("stream") as {
      Readable: new (opts: unknown) => any;
      Writable: new (opts: unknown) => any;
    };

    const chunks: string[] = [];
    const source = ["hello", " ", "world"];
    const readable = new Readable({
      read(this: { push(chunk: unknown): void }) {
        const next = source.shift();
        this.push(next ?? null);
      },
    });
    const writable = new Writable({
      write(chunk: { toString(): string }, _enc: string, callback: () => void) {
        chunks.push(chunk.toString());
        callback();
      },
    });

    await new Promise<void>((resolve, reject) => {
      readable.pipe(writable);
      writable.on("finish", resolve);
      writable.on("error", reject);
      readable.on("error", reject);
    });

    expect(chunks.join("")).toBe("hello world");
  });

  it("constructs Duplex/Transform/PassThrough (lib/stream.js's full surface)", () => {
    const { require } = createNodeModules(fakeProcess());
    const { Duplex, Transform, PassThrough } = require("stream") as {
      Duplex: new (opts?: unknown) => unknown;
      Transform: new (opts?: unknown) => unknown;
      PassThrough: new () => unknown;
    };

    expect(new Duplex({ read() {}, write(_c: unknown, _e: unknown, cb: () => void) { cb(); } })).toBeTruthy();
    expect(new Transform({ transform(chunk: unknown, _e: unknown, cb: (e?: unknown, c?: unknown) => void) { cb(null, chunk); } })).toBeTruthy();
    expect(new PassThrough()).toBeTruthy();
  });

  it("resolves 'buffer' and round-trips a real Buffer", () => {
    const { require } = createNodeModules(fakeProcess());
    const { Buffer } = require("buffer") as { Buffer: { from(s: string): { toString(enc?: string): string } } };

    const buf = Buffer.from("hello");
    expect(buf.toString("utf8")).toBe("hello");
    expect(buf.toString("hex")).toBe(Buffer.from("hello").toString("hex"));
  });

  it("caches a module instance across repeated requires", () => {
    const { require } = createNodeModules(fakeProcess());
    expect(require("events")).toBe(require("events"));
  });

  it("throws a clear error for a builtin outside this phase's vendored set", () => {
    const { require } = createNodeModules(fakeProcess());
    expect(() => require("child_process")).toThrow(/no vendored Node builtin 'child_process'/);
  });

  it("reports has() for both public and internal ids", () => {
    const { has } = createNodeModules(fakeProcess());
    expect(has("events")).toBe(true);
    expect(has("node:events")).toBe(true);
    expect(has("internal/streams/readable")).toBe(true);
    expect(has("http")).toBe(true);
    expect(has("child_process")).toBe(false);
  });
});
