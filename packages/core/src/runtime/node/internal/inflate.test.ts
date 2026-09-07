import { describe, expect, it } from "vitest";
import { createNodeModules } from "../loader";

const fakeProcess = () => ({
  env: {},
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
    queueMicrotask(() => callback(...args));
  },
});

interface InflateModule {
  crc32(bytes: Uint8Array): number;
  adler32(bytes: Uint8Array): number;
  inflateRaw(bytes: Uint8Array, startByte?: number): { output: Uint8Array; bytesConsumed: number };
  gunzip(bytes: Uint8Array): Uint8Array;
  inflateZlib(bytes: Uint8Array): Uint8Array;
}

const requireInflate = (): InflateModule => {
  const { require } = createNodeModules(fakeProcess());
  return require("internal/inflate") as InflateModule;
};

const b64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const utf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

// Real fixtures produced by Node's own (trusted, native) zlib.gzipSync /
// deflateSync / deflateRawSync - see the sibling scratch script used to
// generate these; cross-checking against genuinely compressed bytes rather
// than only round-tripping through this file's own encoder-less decoder.
const FIXTURES = {
  empty: {
    text: "",
    gzip: "H4sIAAAAAAAAEwMAAAAAAAAAAAA=",
    zlib: "eJwDAAAAAAE=",
    raw: "AwA=",
  },
  hello: {
    text: "hello world",
    gzip: "H4sIAAAAAAAAE8tIzcnJVyjPL8pJAQCFEUoNCwAAAA==",
    zlib: "eJzLSM3JyVcozy/KSQEAGgsEXQ==",
    raw: "y0jNyclXKM8vykkBAA==",
  },
  repetitive: {
    text: "the quick brown fox jumps over the lazy dog. ".repeat(50),
    gzip: "H4sIAAAAAAAAEyvJSFUoLM1MzlZIKsovz1NIy69QyCrNLShWyC9LLVIoyUhVyEmsqlRIyU/XA/NGFY8qHlU8qnhU8ajiUcWjigeNYgDAM9X7yggAAA==",
    zlib: "eJwryUhVKCzNTM5WSCrKL89TSMuvUMgqzS0oVsgvSy1SKMlIVchJrKpUSMlP1wPzRhWPKh5VPKp4VPGo4lHFo4oHjWIAKxAuDA==",
    raw: "K8lIVSgszUzOVkgqyi/PU0jLr1DIKs0tKFbIL0stUijJSFXISayqVEjJT9cD80YVjyoeVTyqeFTxqOJRxaOKB41iAA==",
  },
};

describe("internal/inflate crc32/adler32", () => {
  it("matches known crc32 values (verified independently via Python's zlib.crc32)", () => {
    const { crc32 } = requireInflate();
    expect(crc32(new TextEncoder().encode(""))).toBe(0);
    expect(crc32(new TextEncoder().encode("hello world"))).toBe(222957957);
  });

  it("matches known adler32 values (verified independently via Python's zlib.adler32)", () => {
    const { adler32 } = requireInflate();
    expect(adler32(new TextEncoder().encode(""))).toBe(1);
    expect(adler32(new TextEncoder().encode("hello world"))).toBe(436929629);
  });
});

describe("internal/inflate gunzip", () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    it(`decodes a real gzip fixture (${name}) produced by Node's own zlib.gzipSync`, () => {
      const { gunzip } = requireInflate();
      expect(utf8(gunzip(b64(fixture.gzip)))).toBe(fixture.text);
    });
  }

  it("throws a clear error for non-gzip input instead of hanging or corrupting output", () => {
    const { gunzip } = requireInflate();
    expect(() => gunzip(new TextEncoder().encode("not actually gzip data"))).toThrow(/gzip/i);
  });

  it("throws on a truncated/corrupted gzip stream rather than returning partial garbage silently", () => {
    const { gunzip } = requireInflate();
    const truncated = b64(FIXTURES.repetitive.gzip).slice(0, 20);
    expect(() => gunzip(truncated)).toThrow();
  });
});

describe("internal/inflate inflateZlib (RFC 1950)", () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    it(`decodes a real zlib-wrapped fixture (${name}) produced by Node's own zlib.deflateSync`, () => {
      const { inflateZlib } = requireInflate();
      expect(utf8(inflateZlib(b64(fixture.zlib)))).toBe(fixture.text);
    });
  }
});

describe("internal/inflate inflateRaw (RFC 1951)", () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    it(`decodes a real raw-deflate fixture (${name}) produced by Node's own zlib.deflateRawSync`, () => {
      const { inflateRaw } = requireInflate();
      const { output, bytesConsumed } = inflateRaw(b64(fixture.raw));
      expect(utf8(output)).toBe(fixture.text);
      expect(bytesConsumed).toBe(b64(fixture.raw).length);
    });
  }

  it("reports how many bytes it consumed when decoding starts mid-buffer (a gzip payload after its header)", () => {
    const { inflateRaw } = requireInflate();
    const prefix = new TextEncoder().encode("XX");
    const combined = new Uint8Array(prefix.length + b64(FIXTURES.hello.raw).length);
    combined.set(prefix);
    combined.set(b64(FIXTURES.hello.raw), prefix.length);
    const { output, bytesConsumed } = inflateRaw(combined, prefix.length);
    expect(utf8(output)).toBe(FIXTURES.hello.text);
    expect(bytesConsumed).toBe(combined.length);
  });
});
