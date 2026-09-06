import { describe, expect, it } from "vitest";
import { createBufferBinding } from "./buffer";

const binding = createBufferBinding();
const bytesOf = (str: string) => new TextEncoder().encode(str);

describe("internalBinding('buffer')", () => {
  it("round-trips utf8 slice/write", () => {
    const buf = new Uint8Array(16);
    const written = binding.utf8WriteStatic(buf, "hello", 0, 16);
    expect(written).toBe(5);
    expect(binding.utf8Slice(buf, 0, 5)).toBe("hello");
  });

  it("round-trips hex slice/write", () => {
    const buf = new Uint8Array(4);
    binding.hexWrite(buf, "deadbeef", 0, 4);
    expect(binding.hexSlice(buf, 0, 4)).toBe("deadbeef");
  });

  it("round-trips base64 and base64url slice/write", () => {
    const src = bytesOf("hello world");
    const b64 = binding.base64Slice(src, 0, src.length);
    expect(b64).toBe("aGVsbG8gd29ybGQ=");

    const buf = new Uint8Array(src.length);
    const n = binding.base64Write(buf, b64, 0, buf.length);
    expect(n).toBe(src.length);
    expect(binding.utf8Slice(buf, 0, n)).toBe("hello world");

    const b64url = binding.base64urlSlice(src, 0, src.length);
    expect(b64url).not.toContain("+");
    expect(b64url).not.toContain("/");
  });

  it("round-trips latin1 and ascii slices", () => {
    const buf = bytesOf("abc");
    expect(binding.latin1Slice(buf, 0, 3)).toBe("abc");
    expect(binding.asciiSlice(buf, 0, 3)).toBe("abc");
  });

  it("round-trips ucs2 slice/write", () => {
    const buf = new Uint8Array(8);
    const n = binding.ucs2Write(buf, "hi", 0, 8);
    expect(binding.ucs2Slice(buf, 0, n)).toBe("hi");
  });

  it("compares byte ranges lexicographically then by length", () => {
    expect(binding.compare(bytesOf("abc"), bytesOf("abd"))).toBe(-1);
    expect(binding.compare(bytesOf("abc"), bytesOf("abc"))).toBe(0);
    expect(binding.compare(bytesOf("abc"), bytesOf("ab"))).toBe(1);
  });

  it("copies bytes between buffers", () => {
    const dest = new Uint8Array(5);
    const n = binding.copy(bytesOf("hello"), dest, 0, 0, 5);
    expect(n).toBe(5);
    expect(binding.utf8Slice(dest, 0, 5)).toBe("hello");
  });

  it("fills a buffer by repeating the pattern", () => {
    const buf = new Uint8Array(5);
    binding.fill(buf, "ab", 0, 5);
    expect(binding.asciiSlice(buf, 0, 5)).toBe("ababa");
  });

  it("finds a byte/buffer/string needle by index", () => {
    const haystack = bytesOf("hello world");
    expect(binding.indexOfString(haystack, "world", 0, "utf8", true)).toBe(6);
    expect(binding.indexOfBuffer(haystack, bytesOf("lo"), 0, "utf8", true)).toBe(3);
    expect(binding.indexOfNumber(haystack, "w".charCodeAt(0), 0, true)).toBe(6);
    expect(binding.indexOfString(haystack, "nope", 0, "utf8", true)).toBe(-1);
  });

  it("byte-swaps in place", () => {
    expect([...binding.swap16(new Uint8Array([1, 2, 3, 4]))]).toEqual([2, 1, 4, 3]);
    expect([...binding.swap32(new Uint8Array([1, 2, 3, 4]))]).toEqual([4, 3, 2, 1]);
  });

  it("round-trips atob/btoa", () => {
    const encoded = binding.btoa("hello");
    expect(encoded).toBe("aGVsbG8=");
    expect(binding.atob(encoded as string)).toBe("hello");
  });

  it("rejects atob with invalid characters", () => {
    expect(binding.atob("not valid base64!!")).toBe(-2);
  });

  it("detects ascii and utf8 validity", () => {
    expect(binding.isAscii(bytesOf("abc"))).toBe(true);
    expect(binding.isAscii(bytesOf("héllo"))).toBe(false);
    expect(binding.isUtf8(bytesOf("héllo"))).toBe(true);
    expect(binding.isUtf8(new Uint8Array([0xff, 0xfe]))).toBe(false);
  });
});
