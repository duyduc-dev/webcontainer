import { describe, expect, it } from "vitest";
import { Buffer } from "./buffer";

describe("Buffer.from / toString round trips", () => {
  it("round-trips utf8 by default, including multi-byte characters", () => {
    const buf = Buffer.from("hello 世界 🚀");
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.toString()).toBe("hello 世界 🚀");
    expect(buf.toString("utf8")).toBe("hello 世界 🚀");
  });

  it("round-trips hex", () => {
    const buf = Buffer.from("48656c6c6f", "hex");
    expect(buf.toString("utf8")).toBe("Hello");
    expect(buf.toString("hex")).toBe("48656c6c6f");
  });

  it("round-trips base64 and base64url", () => {
    const buf = Buffer.from("hello world");
    expect(buf.toString("base64")).toBe("aGVsbG8gd29ybGQ=");
    expect(Buffer.from("aGVsbG8gd29ybGQ=", "base64").toString()).toBe("hello world");

    const urlSafe = Buffer.from([0xfb, 0xff, 0xbf]);
    const encoded = urlSafe.toString("base64url");
    expect(encoded).not.toMatch(/[+/=]/);
    expect(Buffer.from(encoded, "base64url").equals(urlSafe)).toBe(true);
  });

  it("round-trips ascii/latin1/binary as raw byte-per-char", () => {
    const buf = Buffer.from("café", "latin1");
    expect(buf.toString("latin1")).toBe("café");
  });

  it("constructs from a plain byte array and from another Buffer/Uint8Array", () => {
    expect(Buffer.from([104, 105]).toString()).toBe("hi");
    const original = Buffer.from("hi");
    const copy = Buffer.from(original);
    expect(copy.toString()).toBe("hi");
    copy[0] = 0;
    expect(original.toString()).toBe("hi"); // from() copies, doesn't alias
  });
});

describe("Buffer.alloc / allocUnsafe / isBuffer / byteLength", () => {
  it("alloc() zero-fills by default", () => {
    const buf = Buffer.alloc(4);
    expect([...buf]).toEqual([0, 0, 0, 0]);
  });

  it("alloc() with a numeric fill", () => {
    expect([...Buffer.alloc(3, 7)]).toEqual([7, 7, 7]);
  });

  it("alloc() with a string fill repeats the pattern", () => {
    expect(Buffer.alloc(5, "ab").toString()).toBe("ababa");
  });

  it("allocUnsafe() returns the right length", () => {
    expect(Buffer.allocUnsafe(10).length).toBe(10);
  });

  it("isBuffer distinguishes Buffer from plain Uint8Array", () => {
    expect(Buffer.isBuffer(Buffer.from("x"))).toBe(true);
    expect(Buffer.isBuffer(new Uint8Array(1))).toBe(false);
    expect(Buffer.isBuffer("x")).toBe(false);
  });

  it("byteLength counts encoded bytes, not JS string length", () => {
    expect(Buffer.byteLength("世界")).toBe(6); // 3 bytes per CJK char in utf8
    expect(Buffer.byteLength("hello")).toBe(5);
  });
});

describe("Buffer.concat / equals / compare", () => {
  it("concatenates multiple buffers", () => {
    const combined = Buffer.concat([Buffer.from("foo"), Buffer.from("bar")]);
    expect(combined.toString()).toBe("foobar");
  });

  it("respects an explicit totalLength, truncating the source list", () => {
    const combined = Buffer.concat([Buffer.from("foo"), Buffer.from("bar")], 4);
    expect(combined.toString()).toBe("foob");
  });

  it("equals compares by value, not reference", () => {
    expect(Buffer.from("abc").equals(Buffer.from("abc"))).toBe(true);
    expect(Buffer.from("abc").equals(Buffer.from("abd"))).toBe(false);
    expect(Buffer.from("abc").equals(Buffer.from("ab"))).toBe(false);
  });

  it("compare orders lexicographically, then by length", () => {
    expect(Buffer.from("a").compare(Buffer.from("b"))).toBe(-1);
    expect(Buffer.from("b").compare(Buffer.from("a"))).toBe(1);
    expect(Buffer.from("a").compare(Buffer.from("a"))).toBe(0);
    expect(Buffer.from("ab").compare(Buffer.from("a"))).toBe(1);
    expect(Buffer.compare(Buffer.from("a"), Buffer.from("b"))).toBe(-1);
  });
});

describe("Buffer#write / indexOf / includes", () => {
  it("write() writes at an offset and returns bytes written", () => {
    const buf = Buffer.alloc(8);
    const n = buf.write("hi", 2);
    expect(n).toBe(2);
    expect(buf.toString("utf8", 2, 4)).toBe("hi");
  });

  it("write() truncates instead of overflowing the buffer", () => {
    const buf = Buffer.alloc(3);
    const n = buf.write("hello");
    expect(n).toBe(3);
    expect(buf.toString()).toBe("hel");
  });

  it("indexOf/includes find a string needle", () => {
    const buf = Buffer.from("the quick brown fox");
    expect(buf.indexOf("quick")).toBe(4);
    expect(buf.includes("quick")).toBe(true);
    expect(buf.includes("slow")).toBe(false);
  });

  it("indexOf finds a numeric byte needle", () => {
    expect(Buffer.from("abc").indexOf(98)).toBe(1); // 'b' === 98
  });

  it("indexOf finds a Uint8Array needle and returns -1 when absent", () => {
    const buf = Buffer.from("abcdef");
    expect(buf.indexOf(Buffer.from("cd"))).toBe(2);
    expect(buf.indexOf(Buffer.from("zz"))).toBe(-1);
  });
});

describe("Buffer#slice is a view, not a copy (matches Node, unlike Uint8Array#slice)", () => {
  it("mutating a slice mutates the original buffer", () => {
    const buf = Buffer.from("hello");
    const sliced = buf.slice(1, 3);
    expect(sliced).toBeInstanceOf(Buffer);
    expect(sliced.toString()).toBe("el");

    sliced[0] = "E".charCodeAt(0);
    expect(buf.toString()).toBe("hEllo");
  });
});
