import { describe, expect, it } from "vitest";
import { createVirtualFileSystem } from "./VirtualFileSystem";

describe("VirtualFileSystem", () => {
  it("writes and reads a file back", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/hello.txt", "hi");
    expect(new TextDecoder().decode(vfs.readFile("/hello.txt"))).toBe("hi");
  });

  it("accepts raw bytes for writeFile", () => {
    const vfs = createVirtualFileSystem();
    const bytes = new Uint8Array([1, 2, 3]);
    vfs.writeFile("/bin", bytes);
    expect(vfs.readFile("/bin")).toEqual(bytes);
  });

  it("throws ENOENT reading a file that does not exist", () => {
    const vfs = createVirtualFileSystem();
    expect(() => vfs.readFile("/missing")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("throws ENOENT writing into a directory that does not exist", () => {
    const vfs = createVirtualFileSystem();
    expect(() => vfs.writeFile("/no/such/dir/file.txt", "x")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("mkdir creates a directory that readdir then lists", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/src");
    vfs.writeFile("/src/a.js", "a");
    vfs.writeFile("/src/b.js", "b");
    expect(vfs.readdir("/src")).toEqual(["a.js", "b.js"]);
  });

  it("mkdir throws EEXIST when the directory already exists and recursive is not set", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/src");
    expect(() => vfs.mkdir("/src")).toThrow(expect.objectContaining({ code: "EEXIST" }));
  });

  it("mkdir with recursive creates intermediate directories and is idempotent", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/a/b/c", { recursive: true });
    expect(vfs.exists("/a/b/c")).toBe(true);
    expect(() => vfs.mkdir("/a/b/c", { recursive: true })).not.toThrow();
  });

  it("throws ENOTDIR when traversing through a file as if it were a directory", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/file", "x");
    expect(() => vfs.readFile("/file/nested")).toThrow(expect.objectContaining({ code: "ENOTDIR" }));
  });

  it("throws EISDIR reading a directory as a file", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/dir");
    expect(() => vfs.readFile("/dir")).toThrow(expect.objectContaining({ code: "EISDIR" }));
  });

  it("throws ENOTDIR calling readdir on a file", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/file", "x");
    expect(() => vfs.readdir("/file")).toThrow(expect.objectContaining({ code: "ENOTDIR" }));
  });

  it("stat reports file size and kind", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/file", "hello");
    const stat = vfs.stat("/file");
    expect(stat.isFile()).toBe(true);
    expect(stat.isDirectory()).toBe(false);
    expect(stat.size).toBe(5);
    expect(typeof stat.mtimeMs).toBe("number");
  });

  it("stat reports directory kind with zero size", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/dir");
    const stat = vfs.stat("/dir");
    expect(stat.isDirectory()).toBe(true);
    expect(stat.size).toBe(0);
  });

  it("rm removes a file", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/file", "x");
    vfs.rm("/file");
    expect(vfs.exists("/file")).toBe(false);
  });

  it("rm throws ENOTEMPTY on a non-empty directory without recursive", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/dir");
    vfs.writeFile("/dir/file", "x");
    expect(() => vfs.rm("/dir")).toThrow(expect.objectContaining({ code: "ENOTEMPTY" }));
  });

  it("rm with recursive removes a non-empty directory", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/dir");
    vfs.writeFile("/dir/file", "x");
    vfs.rm("/dir", { recursive: true });
    expect(vfs.exists("/dir")).toBe(false);
  });

  it("rm throws ENOENT for a missing path", () => {
    const vfs = createVirtualFileSystem();
    expect(() => vfs.rm("/missing")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("rename moves a file to a new path", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/a", "content");
    vfs.rename("/a", "/b");
    expect(vfs.exists("/a")).toBe(false);
    expect(new TextDecoder().decode(vfs.readFile("/b"))).toBe("content");
  });

  it("exists returns false for a path that was never created", () => {
    const vfs = createVirtualFileSystem();
    expect(vfs.exists("/nope")).toBe(false);
  });

  it("readFile follows a symlink to a file (absolute target)", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/real.txt", "hi");
    vfs.symlink("/real.txt", "/link.txt");
    expect(new TextDecoder().decode(vfs.readFile("/link.txt"))).toBe("hi");
  });

  it("readFile follows a symlink with a relative target, resolved against the link's own directory", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/a", { recursive: true });
    vfs.mkdir("/b", { recursive: true });
    vfs.writeFile("/b/real.txt", "hi");
    vfs.symlink("../b/real.txt", "/a/link.txt");
    expect(new TextDecoder().decode(vfs.readFile("/a/link.txt"))).toBe("hi");
  });

  it("follows a symlink to a directory as an intermediate path segment", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/real-dir", { recursive: true });
    vfs.writeFile("/real-dir/file.txt", "hi");
    vfs.symlink("/real-dir", "/link-dir");
    expect(new TextDecoder().decode(vfs.readFile("/link-dir/file.txt"))).toBe("hi");
    expect(vfs.readdir("/link-dir")).toEqual(["file.txt"]);
  });

  it("throws ELOOP on a cyclic symlink", () => {
    const vfs = createVirtualFileSystem();
    vfs.symlink("/b", "/a");
    vfs.symlink("/a", "/b");
    expect(() => vfs.readFile("/a")).toThrow(expect.objectContaining({ code: "ELOOP" }));
  });

  it("lstat reports a symlink as a link; stat reports what it points to", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/real.txt", "hi");
    vfs.symlink("/real.txt", "/link.txt");

    const link = vfs.lstat("/link.txt");
    expect(link.isSymbolicLink()).toBe(true);
    expect(link.isFile()).toBe(false);

    const target = vfs.stat("/link.txt");
    expect(target.isSymbolicLink()).toBe(false);
    expect(target.isFile()).toBe(true);
  });

  it("stat throws ENOENT for a dangling symlink; lstat still succeeds", () => {
    const vfs = createVirtualFileSystem();
    vfs.symlink("/does-not-exist", "/link.txt");

    expect(() => vfs.stat("/link.txt")).toThrow(expect.objectContaining({ code: "ENOENT" }));
    expect(vfs.lstat("/link.txt").isSymbolicLink()).toBe(true);
  });

  it("readlink returns the raw stored target string", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/real.txt", "hi");
    vfs.symlink("./real.txt", "/link.txt");
    expect(vfs.readlink("/link.txt")).toBe("./real.txt");
  });

  it("readlink throws EINVAL for a path that is not a symlink", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/real.txt", "hi");
    expect(() => vfs.readlink("/real.txt")).toThrow(expect.objectContaining({ code: "EINVAL" }));
  });

  it("realpath resolves a symlink to its target's canonical path, unlike readlink's raw target string", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/a/b", { recursive: true });
    vfs.writeFile("/a/b/real.txt", "hi");
    vfs.symlink("./b/real.txt", "/a/link.txt");

    expect(vfs.realpath("/a/link.txt")).toBe("/a/b/real.txt");
  });

  it("realpath is a no-op for a path with no symlinks in it", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/real.txt", "hi");
    expect(vfs.realpath("/real.txt")).toBe("/real.txt");
  });

  it("realpath resolves an intermediate symlink, not just a final-segment one", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/real-dir", { recursive: true });
    vfs.writeFile("/real-dir/file.txt", "hi");
    vfs.symlink("/real-dir", "/link-dir");

    expect(vfs.realpath("/link-dir/file.txt")).toBe("/real-dir/file.txt");
  });

  it("realpath throws ENOENT for a dangling symlink, matching stat's behavior", () => {
    const vfs = createVirtualFileSystem();
    vfs.symlink("/does-not-exist", "/link.txt");
    expect(() => vfs.realpath("/link.txt")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("rm removes the symlink itself, not its target", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/real.txt", "hi");
    vfs.symlink("/real.txt", "/link.txt");
    vfs.rm("/link.txt");
    expect(vfs.exists("/link.txt")).toBe(false);
    expect(vfs.exists("/real.txt")).toBe(true);
  });

  it("readdir lists a symlink by its own name, without following it", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/dir", { recursive: true });
    vfs.writeFile("/real.txt", "hi");
    vfs.symlink("/real.txt", "/dir/link.txt");
    expect(vfs.readdir("/dir")).toEqual(["link.txt"]);
  });

  it("symlink throws EEXIST when the path is already taken", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/taken", "x");
    expect(() => vfs.symlink("/anything", "/taken")).toThrow(expect.objectContaining({ code: "EEXIST" }));
  });

  it("new files default to mode 0o644 and directories to 0o755", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/a.txt", "x");
    vfs.mkdir("/dir");
    expect(vfs.stat("/a.txt").mode).toBe(0o644);
    expect(vfs.stat("/dir").mode).toBe(0o755);
  });

  it("chmod changes the reported mode", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/a.sh", "#!/bin/sh\n");
    vfs.chmod("/a.sh", 0o755);
    expect(vfs.stat("/a.sh").mode).toBe(0o755);
  });

  it("chmod follows a symlink to the target, matching fs.chmodSync", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/real.sh", "#!/bin/sh\n");
    vfs.symlink("/real.sh", "/link.sh");
    vfs.chmod("/link.sh", 0o755);
    expect(vfs.stat("/real.sh").mode).toBe(0o755);
  });

  it("rewriting an existing file preserves its mode", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/a.sh", "old");
    vfs.chmod("/a.sh", 0o755);
    vfs.writeFile("/a.sh", "new");
    expect(vfs.stat("/a.sh").mode).toBe(0o755);
  });

  it("lstat reports a fixed 0o777 mode for a symlink itself", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/real.txt", "hi");
    vfs.symlink("/real.txt", "/link.txt");
    expect(vfs.lstat("/link.txt").mode).toBe(0o777);
  });
});
