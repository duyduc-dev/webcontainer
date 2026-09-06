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

describe("path.isAbsolute", () => {
  // Traced need: real tar's own lib/unpack.js sanitizes a tar-slip-style
  // absolute entry path via the bare (non-win32) `path.isAbsolute`.
  it("recognizes a leading-slash path as absolute", () => {
    expect(pathModule.isAbsolute("/a/b")).toBe(true);
  });

  it("rejects a plain relative path", () => {
    expect(pathModule.isAbsolute("a/b")).toBe(false);
  });
});

describe("path.relative", () => {
  // Traced need: real npm's own @npmcli/arborist computes each installed
  // package's `location` as `relative(root.realpath, this.realpath)`.
  it("descends from a shared ancestor into a deeper sibling", () => {
    expect(pathModule.relative("/project", "/project/node_modules/left-pad")).toBe("node_modules/left-pad");
  });

  it("climbs out of one directory and into a sibling", () => {
    expect(pathModule.relative("/project/a", "/project/b")).toBe("../b");
  });

  it("returns an empty string for two equal paths", () => {
    expect(pathModule.relative("/project", "/project")).toBe("");
  });

  it("climbs multiple levels when there is no common ancestor besides root", () => {
    expect(pathModule.relative("/a/b/c", "/x/y")).toBe("../../../x/y");
  });
});

describe("path.parse", () => {
  // Traced need: real npm's own @npmcli/arborist vendors a
  // common-ancestor-path.js that calls `require('path').parse(...)`.
  it("splits an absolute file path into root/dir/base/ext/name", () => {
    expect(pathModule.parse("/a/b/c.txt")).toEqual({ root: "/", dir: "/a/b", base: "c.txt", ext: ".txt", name: "c" });
  });

  it("reports dir as the root itself for a file directly under it", () => {
    expect(pathModule.parse("/file.txt").dir).toBe("/");
  });

  it("reports an empty root and dir for a plain relative path", () => {
    expect(pathModule.parse("file.txt")).toEqual({ root: "", dir: "", base: "file.txt", ext: ".txt", name: "file" });
  });

  it("parses the root path itself", () => {
    expect(pathModule.parse("/")).toEqual({ root: "/", dir: "/", base: "", ext: "", name: "" });
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
