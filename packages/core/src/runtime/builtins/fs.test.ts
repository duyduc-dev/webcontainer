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

  it("constants exposes the same O_* flags require('constants') does (real tar's own get-write-flag.js destructures fs.constants directly)", () => {
    const fs = createFsBuiltin(makeIO());
    expect(fs.constants.O_CREAT).toBeTypeOf("number");
    expect(fs.constants.O_TRUNC).toBeTypeOf("number");
    expect(fs.constants.O_WRONLY).toBeTypeOf("number");
  });

  it("realpathSync resolves a symlink to its target's canonical path", () => {
    const fs = createFsBuiltin(makeIO());
    fs.mkdirSync("/a", { recursive: true });
    fs.writeFileSync("/real.txt", "hi");
    fs.symlinkSync("../real.txt", "/a/link.txt");

    expect(fs.realpathSync("/a/link.txt")).toBe("/real.txt");
  });

  it("realpathSync.native is the same resolver, not a missing/different function (real npm's own path-scurry dependency calls .native directly)", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/real.txt", "hi");
    fs.symlinkSync("/real.txt", "/link.txt");

    expect(typeof fs.realpathSync.native).toBe("function");
    expect(fs.realpathSync.native("/link.txt")).toBe("/real.txt");
  });
});

// Traced need: fs-minipass (real tar's own dependency, used to physically
// write/read extracted package files during `npm install`) is built
// entirely around open/read/write/close by fd, with writev() as its
// multi-buffer-flush fast path - see fs.ts's own doc comment on
// createFsBuiltin for how a VFS with no real OS fds backs this.
describe("createFsBuiltin fd-based I/O", () => {
  it("openSync('w') + writeSync + closeSync persists the written bytes to the VFS path", () => {
    const fs = createFsBuiltin(makeIO());
    const fd = fs.openSync("/out.txt", "w");
    const bytes = new TextEncoder().encode("hello");
    fs.writeSync(fd, bytes, 0, bytes.length, null);
    fs.closeSync(fd);

    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("hello");
  });

  it("sequential writeSync calls (position: null) append in order, matching a real WriteStream's usage", () => {
    const fs = createFsBuiltin(makeIO());
    const fd = fs.openSync("/out.txt", "w");
    for (const chunk of ["a", "b", "c"]) {
      const bytes = new TextEncoder().encode(chunk);
      fs.writeSync(fd, bytes, 0, bytes.length, null);
    }
    fs.closeSync(fd);

    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("abc");
  });

  it("an explicit numeric position writes at that offset without moving the sequential cursor", () => {
    const fs = createFsBuiltin(makeIO());
    const fd = fs.openSync("/out.txt", "w");
    const abc = new TextEncoder().encode("abc");
    fs.writeSync(fd, abc, 0, abc.length, null); // cursor now at 3
    const x = new TextEncoder().encode("X");
    fs.writeSync(fd, x, 0, x.length, 1); // explicit position - overwrite index 1, cursor unmoved
    const d = new TextEncoder().encode("d");
    fs.writeSync(fd, d, 0, d.length, null); // resumes from the sequential cursor (3)
    fs.closeSync(fd);

    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("aXcd");
  });

  it("writev() writes multiple buffers in order and reports the total bytes written", async () => {
    const fs = createFsBuiltin(makeIO());
    const fd = fs.openSync("/out.txt", "w");
    const result = await new Promise<{ error: unknown; total: number | undefined }>((resolve) => {
      fs.writev(fd, [new TextEncoder().encode("foo"), new TextEncoder().encode("bar")], null, (error, total) =>
        resolve({ error, total }),
      );
    });
    fs.closeSync(fd);

    expect(result.error).toBeNull();
    expect(result.total).toBe(6);
    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("foobar");
  });

  it("openSync('r') + readSync reads back what was written, advancing the cursor across calls", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/in.txt", "hello world");
    const fd = fs.openSync("/in.txt", "r");

    const first = new Uint8Array(5);
    const firstRead = fs.readSync(fd, first, 0, 5, null);
    const second = new Uint8Array(6);
    const secondRead = fs.readSync(fd, second, 0, 6, null);
    fs.closeSync(fd);

    expect(firstRead).toBe(5);
    expect(new TextDecoder().decode(first)).toBe("hello");
    expect(secondRead).toBe(6);
    expect(new TextDecoder().decode(second)).toBe(" world");
  });

  it("openSync('r+') on a missing file throws ENOENT (fs-minipass's WriteStream relies on exactly this to retry with 'w')", () => {
    const fs = createFsBuiltin(makeIO());
    expect(() => fs.openSync("/missing.txt", "r+")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("openSync('r+') on an existing file preserves its content for in-place overwrites", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/out.txt", "abc");
    const fd = fs.openSync("/out.txt", "r+");
    const x = new TextEncoder().encode("X");
    fs.writeSync(fd, x, 0, x.length, 1);
    fs.closeSync(fd);

    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("aXc");
  });

  it("closeSync then any further use of the same fd throws EBADF", () => {
    const fs = createFsBuiltin(makeIO());
    const fd = fs.openSync("/out.txt", "w");
    fs.closeSync(fd);

    expect(() => fs.closeSync(fd)).toThrow(expect.objectContaining({ code: "EBADF" }));
  });

  it("writeSync on a fd opened for reading throws EBADF", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/in.txt", "hi");
    const fd = fs.openSync("/in.txt", "r");

    expect(() => fs.writeSync(fd, new Uint8Array(1), 0, 1, null)).toThrow(expect.objectContaining({ code: "EBADF" }));
  });

  it("the callback-style open/write/read/close variants defer via the provided nextTick, not synchronously", async () => {
    const calls: string[] = [];
    let nextTickInvocations = 0;
    const fs = createFsBuiltin(makeIO(), (cb) => {
      nextTickInvocations++;
      queueMicrotask(cb);
    });

    const fd = await new Promise<number>((resolve) => {
      fs.open("/out.txt", "w", (_error, openedFd) => resolve(openedFd!));
      calls.push("open() returned control before its callback ran");
    });
    expect(calls).toEqual(["open() returned control before its callback ran"]);

    const bytes = new TextEncoder().encode("hi");
    await new Promise<void>((resolve) => fs.write(fd, bytes, 0, bytes.length, null, () => resolve()));
    await new Promise<void>((resolve) => fs.close(fd, () => resolve()));

    expect(nextTickInvocations).toBe(3); // open + write + close
    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("hi");
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

  it("realpath resolves a symlink to its target's canonical path", async () => {
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));
    fs.writeFileSync("/real.txt", "hi");
    fs.symlinkSync("/real.txt", "/link.txt");

    await expect(fsPromises.realpath("/link.txt")).resolves.toBe("/real.txt");
  });
});
