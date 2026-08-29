import { describe, expect, it } from "vitest";
import {
  FsOp,
  FsResultKind,
  WireOverflowError,
  decodeFsRequest,
  decodeFsResponse,
  encodeFsRequest,
  encodeFsResponseError,
  encodeFsResponseOk,
} from "./syncFsWireFormat";

function buffer(size = 1024): Uint8Array {
  return new Uint8Array(size);
}

describe("fs request encode/decode", () => {
  it.each([FsOp.READ_FILE, FsOp.EXISTS, FsOp.STAT, FsOp.READDIR])(
    "round-trips op %i with a plain path",
    (op) => {
      const buf = buffer();
      const length = encodeFsRequest(buf, { op, path: "/project/src/index.ts" });
      expect(decodeFsRequest(buf, length)).toEqual({ op, path: "/project/src/index.ts" });
    },
  );

  it("round-trips a path containing multi-byte UTF-8 characters", () => {
    const buf = buffer();
    const path = "/项目/日本語/emoji-🚀-file.js";
    const length = encodeFsRequest(buf, { op: FsOp.READ_FILE, path });
    expect(decodeFsRequest(buf, length)).toEqual({ op: FsOp.READ_FILE, path });
  });

  it("throws WireOverflowError instead of silently truncating when the path doesn't fit", () => {
    const buf = buffer(4);
    expect(() => encodeFsRequest(buf, { op: FsOp.READ_FILE, path: "/way/too/long" })).toThrow(
      WireOverflowError,
    );
  });
});

describe("fs response encode/decode — success", () => {
  it("round-trips file content bytes, including empty content", () => {
    const buf = buffer();
    const content = new TextEncoder().encode("export const x = 1;\n");
    const length = encodeFsResponseOk(buf, { kind: FsResultKind.BYTES, content });
    const decoded = decodeFsResponse(buf, length);
    expect(decoded).toEqual({ ok: true, result: { kind: FsResultKind.BYTES, content } });

    const emptyLength = encodeFsResponseOk(buf, {
      kind: FsResultKind.BYTES,
      content: new Uint8Array(0),
    });
    expect(decodeFsResponse(buf, emptyLength)).toEqual({
      ok: true,
      result: { kind: FsResultKind.BYTES, content: new Uint8Array(0) },
    });
  });

  it.each([true, false])("round-trips a bool result (%s)", (value) => {
    const buf = buffer();
    const length = encodeFsResponseOk(buf, { kind: FsResultKind.BOOL, value });
    expect(decodeFsResponse(buf, length)).toEqual({
      ok: true,
      result: { kind: FsResultKind.BOOL, value },
    });
  });

  it("round-trips stat results with real Date.now()-scale mtime/size", () => {
    // Date.now() (~1.7e12 today) overflows a u32 (~4.29e9 max) — this is
    // exactly why mtime/size are encoded as f64, not u32. A regression here
    // would silently corrupt every stat() call on the sync transport.
    const buf = buffer();
    const stat = { type: "file" as const, size: 123_456_789, mtime: Date.now() };
    const length = encodeFsResponseOk(buf, { kind: FsResultKind.STAT, stat });
    expect(decodeFsResponse(buf, length)).toEqual({
      ok: true,
      result: { kind: FsResultKind.STAT, stat },
    });

    const dirLength = encodeFsResponseOk(buf, {
      kind: FsResultKind.STAT,
      stat: { type: "dir", size: 0, mtime: 1_700_000_000_000 },
    });
    expect(decodeFsResponse(buf, dirLength)).toEqual({
      ok: true,
      result: { kind: FsResultKind.STAT, stat: { type: "dir", size: 0, mtime: 1_700_000_000_000 } },
    });
  });

  it("round-trips readdir entries, including an empty directory", () => {
    const buf = buffer();
    const entries = ["index.ts", "package.json", "node_modules"];
    const length = encodeFsResponseOk(buf, { kind: FsResultKind.STRING_ARRAY, entries });
    expect(decodeFsResponse(buf, length)).toEqual({
      ok: true,
      result: { kind: FsResultKind.STRING_ARRAY, entries },
    });

    const emptyLength = encodeFsResponseOk(buf, {
      kind: FsResultKind.STRING_ARRAY,
      entries: [],
    });
    expect(decodeFsResponse(buf, emptyLength)).toEqual({
      ok: true,
      result: { kind: FsResultKind.STRING_ARRAY, entries: [] },
    });
  });

  it("throws WireOverflowError when file content doesn't fit the buffer", () => {
    const buf = buffer(8);
    expect(() =>
      encodeFsResponseOk(buf, {
        kind: FsResultKind.BYTES,
        content: new TextEncoder().encode("this is definitely too long"),
      }),
    ).toThrow(WireOverflowError);
  });
});

describe("fs response encode/decode — error", () => {
  it("round-trips an FSError-shaped error payload", () => {
    const buf = buffer();
    const error = { code: "ENOENT" as const, path: "/missing.js", message: "ENOENT: no such file" };
    const length = encodeFsResponseError(buf, error);
    expect(decodeFsResponse(buf, length)).toEqual({ ok: false, error });
  });

  it("round-trips the EFBIG code used for oversized files", () => {
    const buf = buffer();
    const error = {
      code: "EFBIG" as const,
      path: "/huge-file.bin",
      message: "file too large for sync fs channel",
    };
    const length = encodeFsResponseError(buf, error);
    expect(decodeFsResponse(buf, length)).toEqual({ ok: false, error });
  });
});
