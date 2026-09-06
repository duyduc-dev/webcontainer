import { describe, expect, it } from "vitest";
import { createAssertModule } from "./assert";

describe("createAssertModule", () => {
  it("is callable directly, same as assert.ok (traced need: minizlib's own assert(this[_handle], ...))", () => {
    const assert = createAssertModule();
    expect(() => assert(true)).not.toThrow();
    expect(() => assert(false, "zlib binding closed")).toThrow(/zlib binding closed/);
    expect(() => assert(0)).toThrow(assert.AssertionError);
  });

  it("equal()/notEqual() use loose (==) comparison", () => {
    const assert = createAssertModule();
    expect(() => assert.equal(1, "1")).not.toThrow();
    expect(() => assert.equal(1, 2)).toThrow(assert.AssertionError);
    expect(() => assert.notEqual(1, 2)).not.toThrow();
    expect(() => assert.notEqual(1, "1")).toThrow(assert.AssertionError);
  });

  it("strictEqual()/notStrictEqual() use Object.is, not ==", () => {
    const assert = createAssertModule();
    expect(() => assert.strictEqual(1, "1" as unknown as number)).toThrow(assert.AssertionError);
    expect(() => assert.strictEqual(1, 1)).not.toThrow();
    expect(() => assert.strictEqual(NaN, NaN)).not.toThrow(); // Object.is, unlike ===
    expect(() => assert.notStrictEqual(1, "1" as unknown as number)).not.toThrow();
  });

  it("deepEqual()/deepStrictEqual() compare structurally, including nested objects and arrays", () => {
    const assert = createAssertModule();
    expect(() => assert.deepStrictEqual({ a: [1, 2], b: { c: 3 } }, { a: [1, 2], b: { c: 3 } })).not.toThrow();
    expect(() => assert.deepStrictEqual({ a: 1 }, { a: 2 })).toThrow(assert.AssertionError);
    expect(() => assert.deepStrictEqual([1, 2], [1, 2, 3])).toThrow(assert.AssertionError);
  });

  it("deepEqual() is loose about primitive equality inside the structure, deepStrictEqual() is not", () => {
    const assert = createAssertModule();
    expect(() => assert.deepEqual({ a: 1 }, { a: "1" })).not.toThrow();
    expect(() => assert.deepStrictEqual({ a: 1 }, { a: "1" as unknown as number })).toThrow(assert.AssertionError);
  });

  it("deepStrictEqual() handles circular references without hanging", () => {
    const assert = createAssertModule();
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const b: Record<string, unknown> = { name: "a" };
    b.self = b;
    expect(() => assert.deepStrictEqual(a, b)).not.toThrow();
  });

  it("compares Date and RegExp by value, not reference", () => {
    const assert = createAssertModule();
    expect(() => assert.deepStrictEqual(new Date(2024, 0, 1), new Date(2024, 0, 1))).not.toThrow();
    expect(() => assert.deepStrictEqual(/abc/gi, /abc/gi)).not.toThrow();
    expect(() => assert.deepStrictEqual(/abc/g, /abc/i)).toThrow(assert.AssertionError);
  });

  it("ifError() passes for null/undefined, throws otherwise", () => {
    const assert = createAssertModule();
    expect(() => assert.ifError(null)).not.toThrow();
    expect(() => assert.ifError(undefined)).not.toThrow();
    expect(() => assert.ifError(new Error("boom"))).toThrow(/boom/);
  });

  it("throws()/doesNotThrow() check whether the function actually throws", () => {
    const assert = createAssertModule();
    expect(() =>
      assert.throws(() => {
        throw new Error("x");
      }),
    ).not.toThrow();
    expect(() => assert.throws(() => {})).toThrow(assert.AssertionError);
    expect(() => assert.doesNotThrow(() => {})).not.toThrow();
    expect(() =>
      assert.doesNotThrow(() => {
        throw new Error("x");
      }),
    ).toThrow(assert.AssertionError);
  });

  it("fail() always throws an AssertionError", () => {
    const assert = createAssertModule();
    expect(() => assert.fail("nope")).toThrow(/nope/);
  });
});
