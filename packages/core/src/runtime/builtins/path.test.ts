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

describe("path.posix", () => {
  it("is a self-alias, not a second implementation - this VFS is POSIX-only", () => {
    expect(pathModule.posix).toBe(pathModule);
  });
});

describe("path.win32", () => {
  // Traced need: real tar's own lib/strip-absolute-path.js calls these two
  // specifically (tar-slip sanitization, regardless of host platform).
  it("isAbsolute() recognizes a drive-absolute path", () => {
    expect(pathModule.win32.isAbsolute("C:\\Users\\a")).toBe(true);
    expect(pathModule.win32.isAbsolute("C:/Users/a")).toBe(true);
  });

  it("isAbsolute() recognizes a leading-slash path (either slash style)", () => {
    expect(pathModule.win32.isAbsolute("\\foo")).toBe(true);
    expect(pathModule.win32.isAbsolute("/foo")).toBe(true);
  });

  it("isAbsolute() rejects a drive-relative path and a plain relative path", () => {
    expect(pathModule.win32.isAbsolute("C:foo")).toBe(false);
    expect(pathModule.win32.isAbsolute("foo/bar")).toBe(false);
  });

  it("parse() reports a drive-absolute root, and the base/ext/name split", () => {
    const parsed = pathModule.win32.parse("C:\\Users\\a\\file.txt");
    expect(parsed.root).toBe("C:\\");
    expect(parsed.dir).toBe("C:\\Users\\a");
    expect(parsed.base).toBe("file.txt");
    expect(parsed.ext).toBe(".txt");
    expect(parsed.name).toBe("file");
  });

  it("parse() reports the special drive-relative root (no root path.win32.isAbsolute() itself would still say is absolute)", () => {
    // Real Windows semantics: `c:../foo` is NOT absolute, but does have a
    // "root" of `c:` that strip-absolute-path.js's own loop needs to see.
    const parsed = pathModule.win32.parse("c:../foo");
    expect(parsed.root).toBe("c:");
    expect(pathModule.win32.isAbsolute("c:../foo")).toBe(false);
  });

  it("parse() reports an empty root for a plain relative path", () => {
    expect(pathModule.win32.parse("foo/bar.js").root).toBe("");
  });
});
