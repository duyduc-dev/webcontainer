import { describe, expect, it } from "vitest";
import { createVirtualFileSystem } from "../../kernel/fs/VirtualFileSystem";
import { executeFsRequest } from "../../kernel/fs/syncServer";
import { createFsBuiltin, createFsPromisesBuiltin } from "./fs";
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

  it("symlinkSync + readFileSync follows the link; readlinkSync reads the raw target", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/real.txt", "hi");
    fs.symlinkSync("/real.txt", "/link.txt");

    expect(new TextDecoder().decode(fs.readFileSync("/link.txt"))).toBe("hi");
    expect(fs.readlinkSync("/link.txt")).toBe("/real.txt");
  });

  it("lstatSync reports a symlink as a link; statSync reports what it points to", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/real.txt", "hi");
    fs.symlinkSync("/real.txt", "/link.txt");

    expect(fs.lstatSync("/link.txt").isSymbolicLink()).toBe(true);
    expect(fs.statSync("/link.txt").isSymbolicLink()).toBe(false);
    expect(fs.statSync("/link.txt").isFile()).toBe(true);
  });

  it("chmodSync changes the mode statSync reports", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/a.sh", "#!/bin/sh\n");
    expect(fs.statSync("/a.sh").mode).toBe(0o644);

    fs.chmodSync("/a.sh", 0o755);
    expect(fs.statSync("/a.sh").mode).toBe(0o755);
  });
});

describe("createFsPromisesBuiltin", () => {
  it("resolves every call through the provided nextTick, not a bare native microtask", async () => {
    // Regression test: a plain `async (path) => fs.readFileSync(path)` looks
    // identical from the caller's side but resolves via an untracked native
    // microtask - real npm's own `await fs.mkdir(...)`/`isexe`'s
    // `await fs.promises.stat(...)` silently never completed because of
    // this (see worker.ts's own boot()/drain(): a process with nothing else
    // tracked tears itself down before an untracked microtask's continuation
    // ever runs). Asserting nextTick is what actually drives resolution -
    // not just that the promise eventually settles - is the point of this test.
    let nextTickCalls = 0;
    const nextTick = (callback: () => void) => {
      nextTickCalls++;
      queueMicrotask(callback);
    };
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, nextTick);

    await fsPromises.writeFile("/a.txt", "hi");
    expect(nextTickCalls).toBe(1);

    const contents = await fsPromises.readFile("/a.txt");
    expect(nextTickCalls).toBe(2);
    expect(new TextDecoder().decode(contents)).toBe("hi");
  });

  it("rejects (not throws synchronously) for a missing file, preserving the FSError code", async () => {
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));

    await expect(fsPromises.readFile("/missing")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("access() resolves for an existing path and rejects for a missing one", async () => {
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));
    fs.writeFileSync("/a.txt", "hi");

    await expect(fsPromises.access("/a.txt")).resolves.toBeUndefined();
    await expect(fsPromises.access("/missing")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("mkdir + readdir round-trip", async () => {
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));

    await fsPromises.mkdir("/src", { recursive: true });
    await fsPromises.writeFile("/src/a.js", "a");
    await expect(fsPromises.readdir("/src")).resolves.toEqual(["a.js"]);
  });
});
