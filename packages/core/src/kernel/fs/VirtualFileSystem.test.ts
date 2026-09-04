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
});
