import { describe, expect, it } from "vitest";
import { fileCandidates, nodeModulesDirsFrom, relativeModuleCandidates, splitBareSpecifier } from "./resolveSpecifier";

describe("splitBareSpecifier", () => {
  it("treats a plain specifier with no subpath as just a package name", () => {
    expect(splitBareSpecifier("left-pad")).toEqual({ packageName: "left-pad", subpath: "" });
  });

  it("splits a plain specifier's subpath", () => {
    expect(splitBareSpecifier("lodash/map")).toEqual({ packageName: "lodash", subpath: "map" });
  });

  it("keeps a scoped package's org/name together as the package name", () => {
    expect(splitBareSpecifier("@org/pkg")).toEqual({ packageName: "@org/pkg", subpath: "" });
  });

  it("splits a scoped package's subpath", () => {
    expect(splitBareSpecifier("@org/pkg/sub/path")).toEqual({ packageName: "@org/pkg", subpath: "sub/path" });
  });
});

describe("nodeModulesDirsFrom", () => {
  it("walks from the requiring file's directory up to the root, closest first", () => {
    expect(nodeModulesDirsFrom("/project/src/index.js")).toEqual(["/project/src/node_modules", "/project/node_modules", "/node_modules"]);
  });

  it("includes the root's own node_modules for a top-level file", () => {
    expect(nodeModulesDirsFrom("/index.js")).toEqual(["/node_modules"]);
  });

  it("does not double up on node_modules when the requiring file is already inside one", () => {
    expect(nodeModulesDirsFrom("/project/node_modules/foo/index.js")).toEqual([
      "/project/node_modules/foo/node_modules",
      "/project/node_modules",
      "/node_modules",
    ]);
  });
});

describe("fileCandidates", () => {
  it("generates the exact/.js/.json/index.js candidates in priority order", () => {
    expect(fileCandidates("/a/b")).toEqual(["/a/b", "/a/b.js", "/a/b.json", "/a/b/index.js"]);
  });
});

describe("relativeModuleCandidates (still behaves the same after the fileCandidates extraction)", () => {
  it("resolves a relative specifier against the requiring file's directory", () => {
    expect(relativeModuleCandidates("/a/index.js", "./b")).toEqual(["/a/b", "/a/b.js", "/a/b.json", "/a/b/index.js"]);
  });
});
