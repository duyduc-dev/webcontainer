import { describe, expect, it } from "vitest";
import { createNodeModules } from "./loader";

const fakeProcess = () => ({
  env: {},
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
    queueMicrotask(() => callback(...args));
  },
});

interface BufferModule {
  Buffer: {
    from(data: string | Uint8Array): { toString(): string };
    concat(chunks: unknown[]): { toString(): string; length: number };
  };
}

interface StreamLike {
  on(event: string, listener: (...args: any[]) => void): StreamLike;
  pipe(dest: unknown): StreamLike;
}

interface StreamModule {
  Readable: { from(iterable: unknown[]): StreamLike };
  pipeline(...args: unknown[]): unknown;
}

interface ZlibModule {
  createGzip(): unknown;
  createGunzip(): unknown;
}

const setup = () => {
  const { require } = createNodeModules(fakeProcess());
  return {
    Buffer: (require("buffer") as BufferModule).Buffer,
    ...(require("stream") as unknown as StreamModule),
    zlib: require("zlib") as unknown as ZlibModule,
  };
};

const collect = (stream: any, Buffer: BufferModule["Buffer"]): Promise<{ toString(): string }> =>
  new Promise((resolve, reject) => {
    const chunks: unknown[] = [];
    stream.on("data", (chunk: unknown) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

describe("vendored 'zlib' (stream-based gzip/gunzip over CompressionStream)", () => {
  it("round-trips text through createGzip() -> createGunzip()", async () => {
    const { Buffer, Readable, pipeline, zlib } = setup();

    const original = "hello world, this is a gzip round-trip test\n".repeat(20);
    const source = Readable.from([Buffer.from(original)]);
    const gzip = zlib.createGzip();
    const gunzip = zlib.createGunzip();

    const done = new Promise<void>((resolve, reject) => {
      pipeline(source, gzip, gunzip, (err: unknown) => (err ? reject(err) : resolve()));
    });

    const output = await collect(gunzip, Buffer);
    await done;

    expect(output.toString()).toBe(original);
  });

  it("produces real gzip bytes decodable by the platform's own DecompressionStream", async () => {
    const { Buffer, Readable, zlib } = setup();

    const original = "cross-check against the native decompressor";
    const source = Readable.from([Buffer.from(original)]);
    const gzip = source.pipe(zlib.createGzip());

    const compressed = await collect(gzip, Buffer);

    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    void writer.write(compressed as never);
    void writer.close();
    const reader = ds.readable.getReader();
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    const totalLength = parts.reduce((n, p) => n + p.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const p of parts) {
      merged.set(p, offset);
      offset += p.length;
    }

    expect(new TextDecoder().decode(merged)).toBe(original);
  });

  it("emits an error instead of hanging on malformed gzip input", async () => {
    const { Buffer, Readable, zlib } = setup();

    const source = Readable.from([Buffer.from("not actually gzip data")]);
    const gunzip = source.pipe(zlib.createGunzip());

    const error: unknown = await new Promise((resolve) => {
      gunzip.on("data", () => {});
      gunzip.on("error", resolve);
      gunzip.on("end", () => resolve(null));
    });

    expect(error).toBeTruthy();
  });
});
