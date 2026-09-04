import { describe, expect, it } from "vitest";
import { createVirtualFileSystem } from "./VirtualFileSystem";
import { mount } from "./mount";

describe("mount", () => {
  it("applies a nested declarative tree in one pass", () => {
    const vfs = createVirtualFileSystem();

    mount(vfs, {
      "hello.txt": { file: { contents: "hi" } },
      src: {
        directory: {
          "index.js": { file: { contents: "console.log(1)" } },
          nested: {
            directory: {
              "deep.js": { file: { contents: "deep" } },
            },
          },
        },
      },
    });

    expect(new TextDecoder().decode(vfs.readFile("/hello.txt"))).toBe("hi");
    expect(vfs.readdir("/src")).toEqual(["index.js", "nested"]);
    expect(new TextDecoder().decode(vfs.readFile("/src/index.js"))).toBe("console.log(1)");
    expect(new TextDecoder().decode(vfs.readFile("/src/nested/deep.js"))).toBe("deep");
  });

  it("mounts relative to a given basePath", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/app", { recursive: true });

    mount(vfs, { "file.txt": { file: { contents: "x" } } }, "/app");

    expect(new TextDecoder().decode(vfs.readFile("/app/file.txt"))).toBe("x");
  });

  it("accepts raw bytes as file contents", () => {
    const vfs = createVirtualFileSystem();
    const bytes = new Uint8Array([1, 2, 3]);

    mount(vfs, { "bin": { file: { contents: bytes } } });

    expect(vfs.readFile("/bin")).toEqual(bytes);
  });
});
