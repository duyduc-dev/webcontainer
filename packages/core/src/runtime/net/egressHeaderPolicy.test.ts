import { describe, expect, it } from "vitest";
import { corsSafeHeaders, egressHeaders, stripsCustomHeaders } from "./egressHeaderPolicy";

describe("egressHeaderPolicy", () => {
  it("flags known registry hosts and the registry.* prefix as preflight-hostile", () => {
    expect(stripsCustomHeaders("https://registry.npmjs.org/left-pad")).toBe(true);
    expect(stripsCustomHeaders("https://registry.mycompany.internal/pkg")).toBe(true);
    expect(stripsCustomHeaders("https://api.example.com/data")).toBe(false);
  });

  it("does not strip same-origin requests", () => {
    expect(stripsCustomHeaders("https://registry.npmjs.org/left-pad", "https://registry.npmjs.org")).toBe(false);
  });

  it("does not strip an invalid/relative URL (same-origin by definition)", () => {
    expect(stripsCustomHeaders("/relative/path")).toBe(false);
  });

  it("keeps only CORS-safelisted headers, dropping a non-simple content-type", () => {
    const out = corsSafeHeaders({
      Accept: "application/json",
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
    });
    expect(out).toEqual({ Accept: "application/json" });
  });

  it("keeps a simple content-type value", () => {
    const out = corsSafeHeaders({ "Content-Type": "text/plain" });
    expect(out).toEqual({ "Content-Type": "text/plain" });
  });

  it("egressHeaders strips for a hostile host but leaves other hosts untouched", () => {
    const headers = { Authorization: "Bearer secret", Accept: "*/*" };
    expect(egressHeaders("https://registry.npmjs.org/x", headers)).toEqual({ Accept: "*/*" });
    expect(egressHeaders("https://s3.example.com/bucket/key", headers)).toEqual(headers);
  });

  it("returns undefined when there are no headers to begin with", () => {
    expect(egressHeaders("https://registry.npmjs.org/x", undefined)).toBeUndefined();
  });
});
