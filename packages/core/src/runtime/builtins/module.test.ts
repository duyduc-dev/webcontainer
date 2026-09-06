import { describe, expect, it } from "vitest";
import { createModuleModule } from "./module";

describe("createModuleModule", () => {
  it("builtinModules lists names this runtime actually provides", () => {
    const mod = createModuleModule();
    expect(mod.builtinModules).toContain("fs");
    expect(mod.builtinModules).toContain("path");
    expect(mod.builtinModules).toContain("crypto");
  });

  it("does not claim a module this runtime doesn't implement is builtin", () => {
    const mod = createModuleModule();
    expect(mod.builtinModules).not.toContain("cluster");
    expect(mod.builtinModules).not.toContain("worker_threads");
  });

  it("isBuiltin() matches both bare and \"node:\"-prefixed specifiers", () => {
    const mod = createModuleModule();
    expect(mod.isBuiltin("fs")).toBe(true);
    expect(mod.isBuiltin("node:fs")).toBe(true);
    expect(mod.isBuiltin("left-pad")).toBe(false);
  });
});
