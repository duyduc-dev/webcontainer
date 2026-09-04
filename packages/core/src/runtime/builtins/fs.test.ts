import { describe, expect, it } from "vitest";
import { createVirtualFileSystem } from "../../kernel/fs/VirtualFileSystem";
import { executeFsRequest } from "../../kernel/fs/syncServer";
import { createFsBuiltin } from "./fs";
import type { FsBuiltinIO } from "./fs";

const makeIO = (): FsBuiltinIO => {
  const vfs = createVirtualFileSystem();
  return { callSync: (request) => executeFsRequest(vfs, request) };
};

describe("createFsBuiltin", () => {
  it("writes and reads a file back synchronously", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/a.txt", "hi");
    expect(new TextDecoder().decode(fs.readFileSync("/a.txt"))).toBe("hi");
  });

  it("mkdirSync + readdirSync", () => {
    const fs = createFsBuiltin(makeIO());
    fs.mkdirSync("/src", { recursive: true });
    fs.writeFileSync("/src/a.js", "a");
    expect(fs.readdirSync("/src")).toEqual(["a.js"]);
  });

  it("statSync reports file kind and size", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/a.txt", "hello");
    const stat = fs.statSync("/a.txt");
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBe(5);
  });

  it("existsSync, rmSync, renameSync", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/a.txt", "x");
    expect(fs.existsSync("/a.txt")).toBe(true);

    fs.renameSync("/a.txt", "/b.txt");
    expect(fs.existsSync("/a.txt")).toBe(false);
    expect(fs.existsSync("/b.txt")).toBe(true);

    fs.rmSync("/b.txt");
    expect(fs.existsSync("/b.txt")).toBe(false);
  });

  it("surfaces an FSError with the original code for a missing file", () => {
    const fs = createFsBuiltin(makeIO());
    expect(() => fs.readFileSync("/missing")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("throws DWCError(ERR_NOT_ISOLATED) when no sync channel is available", () => {
    const fs = createFsBuiltin({});
    expect(() => fs.readFileSync("/a.txt")).toThrow(expect.objectContaining({ code: "ERR_NOT_ISOLATED" }));
  });
});
