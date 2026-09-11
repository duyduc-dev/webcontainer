import { describe, expect, it, vi } from "vitest";
import type { FileSystemAPI } from "./FileSystem";
import { createNpmAPI, NPM_VFS_ROOT } from "./npm/Npm";

/** A minimal in-memory FileSystemAPI stand-in - records calls instead of
 * talking to a real kernel worker, since createNpmAPI only ever calls
 * fs.mkdir/mount/writeFile/exists. */
const fakeFs = (existing: Set<string> = new Set()) => {
  const calls: { method: string; args: unknown[] }[] = [];
  const record =
    (method: string, result?: unknown) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(result);
    };

  const fs = {
    mkdir: record("mkdir"),
    writeFile: record("writeFile"),
    readFile: record("readFile"),
    readdir: record("readdir"),
    stat: record("stat"),
    lstat: record("lstat"),
    chmod: record("chmod"),
    symlink: record("symlink"),
    readlink: record("readlink"),
    realpath: record("realpath"),
    rm: record("rm"),
    rename: record("rename"),
    exists: vi.fn((path: string) => {
      calls.push({ method: "exists", args: [path] });
      return Promise.resolve(existing.has(path));
    }),
    mount: record("mount"),
  } as unknown as FileSystemAPI;

  return { fs, calls };
};

describe("createNpmAPI - load()", () => {
  it("mkdirs the npm root before mounting the asset into it", async () => {
    const { fs, calls } = fakeFs();
    const api = createNpmAPI(fs);

    await api.load({ version: "10.9.2", files: { "package.json": "{}" } });

    const mkdirIndex = calls.findIndex((c) => c.method === "mkdir" && c.args[0] === NPM_VFS_ROOT);
    const mountIndex = calls.findIndex((c) => c.method === "mount");
    expect(mkdirIndex).toBeGreaterThanOrEqual(0);
    expect(mountIndex).toBeGreaterThan(mkdirIndex);
    expect(calls[mountIndex]!.args[1]).toBe(NPM_VFS_ROOT);
  });

  it("writes /bin/npm.js, /bin/npx.js and /bin/pnpm.js shims", async () => {
    const { fs, calls } = fakeFs();
    const api = createNpmAPI(fs);

    await api.load({ version: "10.9.2", files: {} });

    const written = calls.filter((c) => c.method === "writeFile").map((c) => c.args[0]);
    expect(written).toContain("/bin/npm.js");
    expect(written).toContain("/bin/npx.js");
    expect(written).toContain("/bin/pnpm.js");
  });

  it("only stubs node-gyp targets that actually exist", async () => {
    const target = `${NPM_VFS_ROOT}/bin/node-gyp-bin/node-gyp`;
    const { fs, calls } = fakeFs(new Set([target]));
    const api = createNpmAPI(fs);

    await api.load({ version: "10.9.2", files: {} });

    const stubbed = calls.filter((c) => c.method === "writeFile" && c.args[0] === target);
    expect(stubbed).toHaveLength(1);
    const otherGypTarget = `${NPM_VFS_ROOT}/node_modules/node-gyp/bin/node-gyp.js`;
    expect(calls.some((c) => c.method === "writeFile" && c.args[0] === otherGypTarget)).toBe(false);
  });

  it("resolves with the asset's version and file count", async () => {
    const { fs } = fakeFs();
    const api = createNpmAPI(fs);

    const result = await api.load({ version: "10.9.2", files: { a: "1", b: "2" } });

    expect(result).toEqual({ version: "10.9.2", fileCount: 2 });
  });
});

describe("createNpmAPI - loadFrom()", () => {
  it("fetches the url, then loads the decoded asset", async () => {
    const { fs, calls } = fakeFs();
    const api = createNpmAPI(fs);
    const asset = { version: "10.9.2", files: { "package.json": "{}" } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => asset })),
    );

    const result = await api.loadFrom("/vendor/npm.json");

    expect(result).toEqual({ version: "10.9.2", fileCount: 1 });
    expect(calls.some((c) => c.method === "mount")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("throws a clear error when the fetch fails", async () => {
    const { fs } = fakeFs();
    const api = createNpmAPI(fs);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );

    await expect(api.loadFrom("/vendor/npm.json")).rejects.toThrow(/404/);
    vi.unstubAllGlobals();
  });
});
