import { describe, expect, it } from "vitest";
import { createNodeModules } from "./loader";

const fakeProcess = () => ({
  env: {},
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
    queueMicrotask(() => callback(...args));
  },
});

describe("vendored 'async_hooks' (AsyncResource-only shim)", () => {
  it("runInAsyncScope calls the function with the given thisArg/args", () => {
    const { require } = createNodeModules(fakeProcess());
    const { AsyncResource } = require("async_hooks") as { AsyncResource: new (type: string) => any };

    const resource = new AsyncResource("TEST");
    const self = { tag: "ctx" };
    const result = resource.runInAsyncScope(function (this: unknown, a: number, b: number) {
      expect(this).toBe(self);
      return a + b;
    }, self, 1, 2);

    expect(result).toBe(3);
  });

  it("bind() preserves thisArg across the returned wrapper", () => {
    const { require } = createNodeModules(fakeProcess());
    const { AsyncResource } = require("async_hooks") as { AsyncResource: new (type: string) => any };

    const resource = new AsyncResource("TEST");
    const self = { count: 0 };
    const bound = resource.bind(function (this: { count: number }, n: number) {
      this.count += n;
    }, self);

    bound(5);
    expect(self.count).toBe(5);
  });

  it("throws loudly for AsyncLocalStorage (needs real V8 hooks, not implemented)", () => {
    const { require } = createNodeModules(fakeProcess());
    const { AsyncLocalStorage } = require("async_hooks") as { AsyncLocalStorage: new () => unknown };

    expect(() => new AsyncLocalStorage()).toThrow(/not available in this runtime/);
  });

  it("is what stream.pipeline() actually reaches for internally (regression guard)", async () => {
    const { require } = createNodeModules(fakeProcess());
    const { Readable, Writable, pipeline } = require("stream") as {
      Readable: { from(it: unknown[]): any };
      Writable: new (opts: unknown) => any;
      pipeline(...args: unknown[]): unknown;
    };

    const chunks: string[] = [];
    const writable = new Writable({
      write(chunk: { toString(): string }, _enc: string, cb: () => void) {
        chunks.push(chunk.toString());
        cb();
      },
    });

    await new Promise<void>((resolve, reject) => {
      pipeline(Readable.from(["a", "b"]), writable, (err: unknown) => (err ? reject(err) : resolve()));
    });

    expect(chunks.join("")).toBe("ab");
  });
});
