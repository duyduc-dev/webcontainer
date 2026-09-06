import { describe, expect, it } from "vitest";
import {
  decodeFsRequest,
  decodeFsResponse,
  encodeFsRequest,
  encodeFsResponse,
  FsOp,
} from "./syncWireFormat";
import type { FsRequest, FsResponse } from "./syncWireFormat";

const BUFFER_SIZE = 4096;

const roundTripRequest = (request: FsRequest): FsRequest => {
  const buffer = new ArrayBuffer(BUFFER_SIZE);
  encodeFsRequest(request, buffer);
  return decodeFsRequest(buffer);
};

const roundTripResponse = (response: FsResponse): FsResponse => {
  const buffer = new ArrayBuffer(BUFFER_SIZE);
  encodeFsResponse(response, buffer);
  return decodeFsResponse(buffer);
};

describe("syncWireFormat requests", () => {
  it("round-trips READ_FILE", () => {
    expect(roundTripRequest({ op: FsOp.READ_FILE, path: "/a.txt" })).toEqual({
      op: FsOp.READ_FILE,
      path: "/a.txt",
    });
  });

  it("round-trips WRITE_FILE with binary contents", () => {
    const contents = new Uint8Array([1, 2, 3, 255]);
    expect(roundTripRequest({ op: FsOp.WRITE_FILE, path: "/a.bin", contents })).toEqual({
      op: FsOp.WRITE_FILE,
      path: "/a.bin",
      contents,
    });
  });

  it("round-trips MKDIR with the recursive flag", () => {
    expect(roundTripRequest({ op: FsOp.MKDIR, path: "/a/b", recursive: true })).toEqual({
      op: FsOp.MKDIR,
      path: "/a/b",
      recursive: true,
    });
  });

  it("round-trips READDIR", () => {
    expect(roundTripRequest({ op: FsOp.READDIR, path: "/dir" })).toEqual({ op: FsOp.READDIR, path: "/dir" });
  });

  it("round-trips STAT", () => {
    expect(roundTripRequest({ op: FsOp.STAT, path: "/a" })).toEqual({ op: FsOp.STAT, path: "/a" });
  });

  it("round-trips RM with the recursive flag", () => {
    expect(roundTripRequest({ op: FsOp.RM, path: "/dir", recursive: false })).toEqual({
      op: FsOp.RM,
      path: "/dir",
      recursive: false,
    });
  });

  it("round-trips RENAME", () => {
    expect(roundTripRequest({ op: FsOp.RENAME, from: "/a", to: "/b" })).toEqual({
      op: FsOp.RENAME,
      from: "/a",
      to: "/b",
    });
  });

  it("round-trips EXISTS", () => {
    expect(roundTripRequest({ op: FsOp.EXISTS, path: "/a" })).toEqual({ op: FsOp.EXISTS, path: "/a" });
  });

  it("round-trips SYMLINK", () => {
    expect(roundTripRequest({ op: FsOp.SYMLINK, target: "../real.txt", path: "/a/link.txt" })).toEqual({
      op: FsOp.SYMLINK,
      target: "../real.txt",
      path: "/a/link.txt",
    });
  });

  it("round-trips READLINK", () => {
    expect(roundTripRequest({ op: FsOp.READLINK, path: "/link.txt" })).toEqual({ op: FsOp.READLINK, path: "/link.txt" });
  });

  it("round-trips REALPATH", () => {
    expect(roundTripRequest({ op: FsOp.REALPATH, path: "/link.txt" })).toEqual({ op: FsOp.REALPATH, path: "/link.txt" });
  });

  it("round-trips CHMOD", () => {
    expect(roundTripRequest({ op: FsOp.CHMOD, path: "/a.sh", mode: 0o755 })).toEqual({
      op: FsOp.CHMOD,
      path: "/a.sh",
      mode: 0o755,
    });
  });

  it("round-trips LSTAT", () => {
    expect(roundTripRequest({ op: FsOp.LSTAT, path: "/link.txt" })).toEqual({ op: FsOp.LSTAT, path: "/link.txt" });
  });

  it("round-trips a unicode path", () => {
    expect(roundTripRequest({ op: FsOp.READ_FILE, path: "/日本語/файл.txt" })).toEqual({
      op: FsOp.READ_FILE,
      path: "/日本語/файл.txt",
    });
  });
});

describe("syncWireFormat responses", () => {
  it("round-trips a READ_FILE success response", () => {
    const contents = new Uint8Array([9, 8, 7]);
    expect(roundTripResponse({ ok: true, op: FsOp.READ_FILE, contents })).toEqual({
      ok: true,
      op: FsOp.READ_FILE,
      contents,
    });
  });

  it("round-trips a READDIR success response with multiple entries", () => {
    expect(roundTripResponse({ ok: true, op: FsOp.READDIR, entries: ["a.js", "b.js"] })).toEqual({
      ok: true,
      op: FsOp.READDIR,
      entries: ["a.js", "b.js"],
    });
  });

  it("round-trips a STAT success response", () => {
    const response: FsResponse = {
      ok: true,
      op: FsOp.STAT,
      isFile: true,
      isDirectory: false,
      isSymbolicLink: false,
      size: 1234,
      mode: 0o644,
      mtimeMs: Date.now(),
    };
    expect(roundTripResponse(response)).toEqual(response);
  });

  it("round-trips an LSTAT success response reporting a symlink", () => {
    const response: FsResponse = {
      ok: true,
      op: FsOp.LSTAT,
      isFile: false,
      isDirectory: false,
      isSymbolicLink: true,
      size: 0,
      mode: 0o777,
      mtimeMs: Date.now(),
    };
    expect(roundTripResponse(response)).toEqual(response);
  });

  it("round-trips a SYMLINK success response", () => {
    expect(roundTripResponse({ ok: true, op: FsOp.SYMLINK })).toEqual({ ok: true, op: FsOp.SYMLINK });
  });

  it("round-trips a READLINK success response", () => {
    expect(roundTripResponse({ ok: true, op: FsOp.READLINK, target: "../real.txt" })).toEqual({
      ok: true,
      op: FsOp.READLINK,
      target: "../real.txt",
    });
  });

  it("round-trips a CHMOD success response", () => {
    expect(roundTripResponse({ ok: true, op: FsOp.CHMOD })).toEqual({ ok: true, op: FsOp.CHMOD });
  });

  it("round-trips a REALPATH success response", () => {
    expect(roundTripResponse({ ok: true, op: FsOp.REALPATH, path: "/a/b/real.txt" })).toEqual({
      ok: true,
      op: FsOp.REALPATH,
      path: "/a/b/real.txt",
    });
  });

  it("round-trips an EXISTS success response", () => {
    expect(roundTripResponse({ ok: true, op: FsOp.EXISTS, exists: true })).toEqual({
      ok: true,
      op: FsOp.EXISTS,
      exists: true,
    });
  });

  it("round-trips a void success response (WRITE_FILE)", () => {
    expect(roundTripResponse({ ok: true, op: FsOp.WRITE_FILE })).toEqual({ ok: true, op: FsOp.WRITE_FILE });
  });

  it("round-trips an error response", () => {
    const response: FsResponse = { ok: false, code: "ENOENT", path: "/missing", message: "ENOENT: /missing" };
    expect(roundTripResponse(response)).toEqual(response);
  });
});
