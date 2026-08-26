import { VirtualFileSystem } from "../fs/VirtualFileSystem";
import { dirname } from "../fs/path";
import { resolveModule } from "./resolve";
import { ALL_BUILTIN_MODULE_NAMES } from "../../workers/guest/builtins";

export type PreloadResult = {
  sources: Map<string, string>;
  resolutions: Map<string, string>;
  fsFiles: Map<string, string>;
};

const REQUIRE_PATTERN = /require\(\s*["']([^"']+)["']\s*\)/g;
const FS_LITERAL_PATTERN = /\b(?:readFileSync|existsSync)\(\s*["'](\/[^"']+)["']/g;

function findRequireSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(REQUIRE_PATTERN)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function findFsLiteralPaths(source: string): string[] {
  const paths: string[] = [];
  for (const match of source.matchAll(FS_LITERAL_PATTERN)) {
    paths.push(match[1]);
  }
  return paths;
}

export function resolutionKey(fromPath: string, specifier: string): string {
  return JSON.stringify([fromPath, specifier]);
}

// Statically pre-resolves and reads the whole module graph reachable from
// `entryPath` up front, so the Guest Worker's require() can run synchronously
// against an in-memory cache instead of needing SharedArrayBuffer/Atomics to
// block on the kernel worker's VFS. A require() built from a computed string
// (not a literal) won't be found by this scan and fails at runtime instead.
// The same static-literal-only limitation applies to the fs.readFileSync/
// existsSync scan below.
export function preloadModules(vfs: VirtualFileSystem, entryPath: string): PreloadResult {
  const sources = new Map<string, string>();
  const resolutions = new Map<string, string>();
  const fsFiles = new Map<string, string>();
  const queue = [entryPath];

  while (queue.length > 0) {
    const path = queue.shift()!;
    if (sources.has(path)) continue;

    const source = new TextDecoder().decode(vfs.readFile(path));
    sources.set(path, source);
    if (path.endsWith(".json")) continue;

    for (const specifier of findRequireSpecifiers(source)) {
      if (ALL_BUILTIN_MODULE_NAMES.has(specifier)) continue;
      try {
        const resolved = resolveModule(vfs, dirname(path), specifier);
        resolutions.set(resolutionKey(path, specifier), resolved);
        if (!sources.has(resolved)) queue.push(resolved);
      } catch {
        // Left unresolved; surfaces as "Cannot find module" only if the guest
        // actually reaches this require() call at runtime.
      }
    }

    for (const fsPath of findFsLiteralPaths(source)) {
      if (fsFiles.has(fsPath)) continue;
      if (vfs.exists(fsPath) && vfs.stat(fsPath).type === "file") {
        fsFiles.set(fsPath, new TextDecoder().decode(vfs.readFile(fsPath)));
      }
    }
  }

  return { sources, resolutions, fsFiles };
}
