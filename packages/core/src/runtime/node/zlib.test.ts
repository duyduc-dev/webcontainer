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

interface SyncZlibHandle {
  _handle: { close(): void };
  close(): void;
  on(event: string, listener: (...args: any[]) => void): unknown;
  _processChunk(chunk: Uint8Array, flushFlag: number): Uint8Array | undefined;
}

interface ZlibModule {
  createGzip(): unknown;
  createGunzip(): unknown;
  gzip(buffer: unknown, callback: (error: unknown, result?: unknown) => void): void;
  gunzip(buffer: unknown, callback: (error: unknown, result?: unknown) => void): void;
  Unzip: new () => SyncZlibHandle;
  Gunzip: new () => SyncZlibHandle;
  Gzip: new () => SyncZlibHandle;
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

  // Real @rollup/wasm-node does `import { gzip } from 'zlib'` at its own top
  // level - traced need, see zlib.js's own doc comment on gzip/gunzip.
  it("gzip()/gunzip() round-trip through the callback API (real @rollup/wasm-node's own top-level `import { gzip } from 'zlib'`)", async () => {
    const { Buffer, zlib } = setup();

    const original = "gzip callback round-trip\n".repeat(10);
    const compressed = await new Promise<{ toString(): string }>((resolve, reject) => {
      zlib.gzip(Buffer.from(original), (error, result) => (error ? reject(error) : resolve(result as { toString(): string })));
    });
    const decompressed = await new Promise<{ toString(): string }>((resolve, reject) => {
      zlib.gunzip(compressed, (error, result) => (error ? reject(error) : resolve(result as { toString(): string })));
    });

    expect(decompressed.toString()).toBe(original);
  });
});

// Real npm's own `minizlib` (used by `tar` to extract a downloaded package
// tarball) never touches createGzip()/createGunzip() - it constructs these
// classes DIRECTLY and drives them through their internal, synchronous
// `_processChunk(chunk, flushFlag)` method instead of the normal streaming
// API, monkey-patching `._handle` around each call. These tests exercise
// exactly that shape, not the public stream API.
describe("vendored 'zlib' Unzip/Gunzip/Gzip (minizlib's synchronous _processChunk contract)", () => {
  const Z_FINISH = 4;
  const Z_NO_FLUSH = 0;

  it("Unzip decodes a real gzip payload once the final (Z_FINISH) chunk arrives, buffering everything before that", async () => {
    const { Buffer, Readable, zlib } = setup();
    const original = "hello from a real gzip stream, decoded via _processChunk";
    const compressed = await collect(Readable.from([Buffer.from(original)]).pipe(zlib.createGzip()), Buffer);

    const unzip = new zlib.Unzip();
    const first = unzip._processChunk(compressed as unknown as Uint8Array, Z_NO_FLUSH);
    expect(first).toBeUndefined(); // not finished yet - nothing decoded

    const result = unzip._processChunk(new Uint8Array(0), Z_FINISH);
    expect(new TextDecoder().decode(result)).toBe(original);
  });

  it("Gunzip behaves the same way as Unzip for real gzip input", async () => {
    const { Buffer, Readable, zlib } = setup();
    const original = "same contract, different class name";
    const compressed = await collect(Readable.from([Buffer.from(original)]).pipe(zlib.createGzip()), Buffer);

    const gunzip = new zlib.Gunzip();
    const result = gunzip._processChunk(compressed as unknown as Uint8Array, Z_FINISH);
    expect(new TextDecoder().decode(result)).toBe(original);
  });

  it("splits the compressed bytes across multiple _processChunk calls before the final flush, matching how minizlib actually streams data in", async () => {
    const { Buffer, Readable, zlib } = setup();
    const original = "chunked input reassembled before decoding";
    const compressed = (await collect(Readable.from([Buffer.from(original)]).pipe(zlib.createGzip()), Buffer)) as Uint8Array;
    const mid = Math.floor(compressed.length / 2);

    const unzip = new zlib.Unzip();
    unzip._processChunk(compressed.slice(0, mid), Z_NO_FLUSH);
    const result = unzip._processChunk(compressed.slice(mid), Z_FINISH);
    expect(new TextDecoder().decode(result)).toBe(original);
  });

  it("exposes the exact shape minizlib depends on: .on()/.close()/._handle.close(), all safely reassignable", () => {
    const { zlib } = setup();
    const unzip = new zlib.Unzip();
    expect(typeof unzip.on).toBe("function");
    expect(typeof unzip.close).toBe("function");
    expect(typeof unzip._handle.close).toBe("function");

    // minizlib temporarily no-ops both around every _processChunk call.
    unzip._handle.close = () => {};
    unzip.close = () => {};
    expect(() => unzip.close()).not.toThrow();
  });

  it("Gzip (compression) constructs without throwing, but throws a clear error if actually driven", () => {
    const { zlib } = setup();
    const gzip = new zlib.Gzip();
    expect(() => gzip._processChunk(new Uint8Array([1, 2, 3]), Z_FINISH)).toThrow(/not implemented/i);
  });
});
