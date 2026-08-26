import { VirtualFileSystem } from "../fs/VirtualFileSystem";
import { dirname } from "../fs/path";
import { resolveModule } from "./resolve";

export type PreloadResult = {
  sources: Map<string, string>;
  resolutions: Map<string, string>;
};

const REQUIRE_PATTERN = /require\(\s*["']([^"']+)["']\s*\)/g;

function findRequireSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(REQUIRE_PATTERN)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

export function resolutionKey(fromPath: string, specifier: string): string {
  return JSON.stringify([fromPath, specifier]);
}

// Statically pre-resolves and reads the whole module graph reachable from
// `entryPath` up front, so the Guest Worker's require() can run synchronously
// against an in-memory cache instead of needing SharedArrayBuffer/Atomics to
// block on the kernel worker's VFS. A require() built from a computed string
// (not a literal) won't be found by this scan and fails at runtime instead.
export function preloadModules(vfs: VirtualFileSystem, entryPath: string): PreloadResult {
  const sources = new Map<string, string>();
  const resolutions = new Map<string, string>();
  const queue = [entryPath];

  while (queue.length > 0) {
    const path = queue.shift()!;
    if (sources.has(path)) continue;

    const source = new TextDecoder().decode(vfs.readFile(path));
    sources.set(path, source);
    if (path.endsWith(".json")) continue;

    for (const specifier of findRequireSpecifiers(source)) {
      try {
        const resolved = resolveModule(vfs, dirname(path), specifier);
        resolutions.set(resolutionKey(path, specifier), resolved);
        if (!sources.has(resolved)) queue.push(resolved);
      } catch {
        // Left unresolved; surfaces as "Cannot find module" only if the guest
        // actually reaches this require() call at runtime.
      }
    }
  }

  return { sources, resolutions };
}
