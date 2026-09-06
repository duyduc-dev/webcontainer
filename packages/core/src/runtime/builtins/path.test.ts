import { describe, expect, it } from "vitest";
import pathModule from "./path";

describe("path.resolve", () => {
  it("joins a relative segment onto an absolute one", () => {
    expect(pathModule.resolve("/project", "a.txt")).toBe("/project/a.txt");
  });

  it("stops at the last absolute segment, discarding everything before it", () => {
    expect(pathModule.resolve("/project", "/etc/passwd")).toBe("/etc/passwd");
  });

  it("resolves against a root cwd without doubling the leading slash", () => {
    expect(pathModule.resolve("/", "/x/f")).toBe("/x/f");
    expect(pathModule.resolve("/", "x")).toBe("/x");
  });
});
