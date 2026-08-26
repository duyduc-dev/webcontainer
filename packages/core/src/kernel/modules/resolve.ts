import { VirtualFileSystem } from "../fs/VirtualFileSystem";
import { dirname, isAbsolute, join } from "../fs/path";

function tryFile(vfs: VirtualFileSystem, path: string): string | undefined {
  return vfs.exists(path) && vfs.stat(path).type === "file" ? path : undefined;
}

function resolveAsFile(vfs: VirtualFileSystem, basePath: string): string | undefined {
  return (
    tryFile(vfs, basePath) ??
    tryFile(vfs, `${basePath}.js`) ??
    tryFile(vfs, `${basePath}.json`)
  );
}

function readMainField(vfs: VirtualFileSystem, packageJsonPath: string): string | undefined {
  try {
    const content = vfs.readFile(packageJsonPath);
    const pkg = JSON.parse(new TextDecoder().decode(content));
    return typeof pkg.main === "string" ? pkg.main : undefined;
  } catch {
    return undefined;
  }
}

function resolveAsDirectory(vfs: VirtualFileSystem, basePath: string): string | undefined {
  if (!vfs.exists(basePath) || vfs.stat(basePath).type !== "dir") return undefined;

  const main = readMainField(vfs, join(basePath, "package.json"));
  if (main) {
    const resolved = resolveModulePath(vfs, join(basePath, main));
    if (resolved) return resolved;
  }

  return tryFile(vfs, join(basePath, "index.js"));
}

function resolveModulePath(vfs: VirtualFileSystem, basePath: string): string | undefined {
  return resolveAsFile(vfs, basePath) ?? resolveAsDirectory(vfs, basePath);
}

export function resolveModule(vfs: VirtualFileSystem, fromDir: string, specifier: string): string {
  if (specifier.startsWith(".") || isAbsolute(specifier)) {
    const basePath = isAbsolute(specifier) ? specifier : join(fromDir, specifier);
    const resolved = resolveModulePath(vfs, basePath);
    if (!resolved) throw new Error(`Cannot find module '${specifier}'`);
    return resolved;
  }

  let dir = fromDir;
  while (true) {
    const candidate = join(dir, "node_modules", specifier);
    const resolved = resolveModulePath(vfs, candidate);
    if (resolved) return resolved;
    if (dir === "/") break;
    dir = dirname(dir);
  }

  throw new Error(`Cannot find module '${specifier}'`);
}
