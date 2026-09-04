import { describe, expect, it } from "vitest";
import { createVirtualFileSystem } from "../kernel/fs/VirtualFileSystem";
import type { FsBuiltin } from "../runtime/builtins/fs";
import { runShellLine } from "./Shell";

/** VirtualFileSystem's methods are already synchronous - just rename them to the *Sync shape. */
const fsBuiltinFromVfs = (vfs: ReturnType<typeof createVirtualFileSystem>): FsBuiltin => ({
  readFileSync: (path) => vfs.readFile(path),
  writeFileSync: (path, contents) => vfs.writeFile(path, contents),
  mkdirSync: (path, options) => vfs.mkdir(path, options),
  readdirSync: (path) => vfs.readdir(path),
  statSync: (path) => vfs.stat(path),
  rmSync: (path, options) => vfs.rm(path, options),
  renameSync: (from, to) => vfs.rename(from, to),
  existsSync: (path) => vfs.exists(path),
});

describe("runShellLine", () => {
  it("runs a chained mkdir -p / echo> / cat sequence end to end", () => {
    const vfs = createVirtualFileSystem();
    const fs = fsBuiltinFromVfs(vfs);

    const first = runShellLine("mkdir -p /x && echo hi > /x/f", "/", fs);
    expect(first.cwd).toBe("/");

    const second = runShellLine("cat /x/f", first.cwd, fs);
    expect(second.output).toBe("hi\n");
  });

  it("pwd reports the current working directory", () => {
    const fs = fsBuiltinFromVfs(createVirtualFileSystem());
    const result = runShellLine("pwd", "/some/dir", fs);
    expect(result.output).toBe("/some/dir\n");
  });

  it("cd updates cwd for the rest of the (chained) line", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/x");
    const fs = fsBuiltinFromVfs(vfs);

    const result = runShellLine("cd /x && pwd", "/", fs);
    expect(result.cwd).toBe("/x");
    expect(result.output).toBe("/x\n");
  });

  it("ls lists directory entries", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/x");
    vfs.writeFile("/x/a.txt", "a");
    vfs.writeFile("/x/b.txt", "b");
    const fs = fsBuiltinFromVfs(vfs);

    expect(runShellLine("ls /x", "/", fs).output).toBe("a.txt\nb.txt\n");
  });

  it("rm -r removes a non-empty directory", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/x");
    vfs.writeFile("/x/a.txt", "a");
    const fs = fsBuiltinFromVfs(vfs);

    runShellLine("rm -r /x", "/", fs);
    expect(vfs.exists("/x")).toBe(false);
  });

  it("mv renames a file", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/a", "content");
    const fs = fsBuiltinFromVfs(vfs);

    runShellLine("mv /a /b", "/", fs);
    expect(vfs.exists("/a")).toBe(false);
    expect(new TextDecoder().decode(vfs.readFile("/b"))).toBe("content");
  });

  it("throws a clear error for an unknown command", () => {
    const fs = fsBuiltinFromVfs(createVirtualFileSystem());
    expect(() => runShellLine("nope", "/", fs)).toThrow(/nope: command not found/);
  });
});
