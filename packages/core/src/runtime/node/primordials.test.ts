import { describe, expect, it } from "vitest";
import { primordials } from "./primordials";

describe("primordials", () => {
  it("resolves a global namespace by name", () => {
    expect(primordials.Array).toBe(Array);
    expect(primordials.Uint8Array).toBe(Uint8Array);
  });

  it("resolves a static method or constant", () => {
    expect(primordials.ArrayIsArray(["x"])).toBe(true);
    expect(primordials.MathFloor(1.9)).toBe(1);
    expect(primordials.NumberMAX_SAFE_INTEGER).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("resolves <Ns>Prototype to the prototype object", () => {
    expect(primordials.ArrayPrototype).toBe(Array.prototype);
  });

  it("resolves and uncurries a prototype method", () => {
    expect(primordials.StringPrototypeSlice("hello", 1, 3)).toBe("el");
    expect(primordials.ArrayPrototypePush).toBeInstanceOf(Function);
    const arr = [1, 2];
    primordials.ArrayPrototypePush(arr, 3);
    expect(arr).toEqual([1, 2, 3]);
  });

  it("resolves a prototype accessor via Get<Prop>", () => {
    const buf = new Uint8Array(4).buffer;
    expect(primordials.TypedArrayPrototypeGetBuffer(new Uint8Array(buf))).toBe(buf);
  });

  it("resolves a well-known symbol prototype member", () => {
    const result = primordials.RegExpPrototypeSymbolReplace(/a/, "banana", "o");
    expect(result).toBe("banana".replace(/a/, "o"));
  });

  it("binds Promise statics but not TypedArray statics", () => {
    expect(primordials.PromiseResolve(1)).toBeInstanceOf(Promise);
    expect(() => primordials.TypedArrayFrom([1, 2])).toThrow();
  });

  it("resolves the hand-listed specials", () => {
    expect(primordials.SafeMap).toBe(Map);
    expect(primordials.SafeSet).toBe(Set);
    expect(typeof primordials.uncurryThis).toBe("function");
    expect(primordials.SafeStringPrototypeSearch("banana", /a/)).toBe(1);
  });

  it("memoizes resolved values", () => {
    expect(primordials.ArrayIsArray).toBe(primordials.ArrayIsArray);
  });

  it("throws loudly for an unresolvable name", () => {
    expect(() => primordials.NotARealPrimordial).toThrow(/is not resolvable/);
  });

  it("does not throw for undefined/NaN", () => {
    expect(primordials.undefined).toBeUndefined();
    expect(Number.isNaN(primordials.NaN)).toBe(true);
  });
});
