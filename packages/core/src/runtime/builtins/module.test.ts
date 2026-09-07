import { describe, expect, it, vi } from "vitest";
import { createModuleModule } from "./module";

// A stub matching moduleLoader.ts's own createRequire(fromPath) shape
// (returns a require()-like function with a real `.resolve`) - real
// behavior (actual resolution) is covered end-to-end by moduleLoader.test.ts's
// own "createRequire" tests; this file only checks createModuleModule's own
// plumbing (path stripping, argument forwarding, `.resolve` passthrough).
const stubCreateRequireForPath = () =>
  vi.fn((fromPath: string) =>
    Object.assign((specifier: string) => `required:${fromPath}:${specifier}`, {
      resolve: (specifier: string) => `resolved:${fromPath}:${specifier}`,
    }),
  );

describe("createModuleModule", () => {
  it("builtinModules lists names this runtime actually provides", () => {
    const mod = createModuleModule(stubCreateRequireForPath());
    expect(mod.builtinModules).toContain("fs");
    expect(mod.builtinModules).toContain("path");
    expect(mod.builtinModules).toContain("crypto");
  });

  it("does not claim a module this runtime doesn't implement is builtin", () => {
    const mod = createModuleModule(stubCreateRequireForPath());
    expect(mod.builtinModules).not.toContain("cluster");
    expect(mod.builtinModules).not.toContain("dgram");
  });

  it("does list worker_threads, even though it's only partially real (MessageChannel works, Worker throws - see worker_threads.ts) - the module itself genuinely exists and is require()-able", () => {
    const mod = createModuleModule(stubCreateRequireForPath());
    expect(mod.builtinModules).toContain("worker_threads");
  });

  it("isBuiltin() matches both bare and \"node:\"-prefixed specifiers", () => {
    const mod = createModuleModule(stubCreateRequireForPath());
    expect(mod.isBuiltin("fs")).toBe(true);
    expect(mod.isBuiltin("node:fs")).toBe(true);
    expect(mod.isBuiltin("left-pad")).toBe(false);
  });

  it("createRequire(filename) returns a require() scoped to filename, forwarding through createRequireForPath (real Vite's own `createRequire(import.meta.url)` pattern)", () => {
    const createRequireForPath = stubCreateRequireForPath();
    const mod = createModuleModule(createRequireForPath);
    const require = mod.createRequire("/home/project/node_modules/vite/dist/node/chunks/node.js");

    expect(require("pnpapi")).toBe("required:/home/project/node_modules/vite/dist/node/chunks/node.js:pnpapi");
    expect(createRequireForPath).toHaveBeenCalledWith("/home/project/node_modules/vite/dist/node/chunks/node.js");
  });

  it("createRequire(filename) strips a file:// prefix (real import.meta.url shape) back to a plain path before forwarding", () => {
    const createRequireForPath = stubCreateRequireForPath();
    const mod = createModuleModule(createRequireForPath);
    const require = mod.createRequire("file:///home/project/node_modules/vite/dist/node/chunks/node.js");

    require("esbuild");
    expect(createRequireForPath).toHaveBeenCalledWith("/home/project/node_modules/vite/dist/node/chunks/node.js");
  });

  it("createRequire(filename)'s returned function carries a real `.resolve` too, matching real Node's own createRequire() contract (traced need: real rolldown's own WebContainer fallback does `__require.resolve('rolldown/package.json')`)", () => {
    const mod = createModuleModule(stubCreateRequireForPath());
    const require = mod.createRequire("/home/project/node_modules/vite/dist/node/chunks/node.js");

    expect(require.resolve("rolldown/package.json")).toBe(
      "resolved:/home/project/node_modules/vite/dist/node/chunks/node.js:rolldown/package.json",
    );
  });

  it("Module is a real, importable binding carrying the same builtinModules/createRequire real Node's Module class exposes as static properties, but no register/registerHooks (real Vite's own dist/node/chunks/node.js only ever presence-checks those two before falling back gracefully - see this file's own doc comment)", () => {
    const mod = createModuleModule(stubCreateRequireForPath());
    expect(mod.Module.builtinModules).toBe(mod.builtinModules);
    expect(typeof mod.Module.createRequire).toBe("function");
    expect((mod.Module as Record<string, unknown>).register).toBeUndefined();
    expect((mod.Module as Record<string, unknown>).registerHooks).toBeUndefined();
  });
});
