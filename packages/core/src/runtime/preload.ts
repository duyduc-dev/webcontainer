import { builtinModules } from "./builtins";
import { relativeModuleCandidates } from "./resolveSpecifier";

type ReadFile = (path: string) => Promise<string>;

interface PreloadResult {
  sources: Record<string, string>;
}

const REQUIRE_PATTERN = /require\(\s*["']([^"']+)["']\s*\)/g;

const extractRequireSpecifiers = (source: string): string[] => {
  const specifiers = new Set<string>();
  for (const match of source.matchAll(REQUIRE_PATTERN)) specifiers.add(match[1]);
  return [...specifiers];
};

const tryReadFirstExisting = async (
  candidates: string[],
  readFile: ReadFile,
): Promise<{ path: string; source: string } | null> => {
  for (const candidate of candidates) {
    try {
      return { path: candidate, source: await readFile(candidate) };
    } catch {
      continue;
    }
  }
  return null;
};

/**
 * Best-effort, regex-based ahead-of-boot scan of the require() graph reachable from
 * entryPath, against the FS worker (via the injected readFile). Only relative
 * specifiers are followed - builtins are skipped (served locally in the process
 * worker) and bare/npm specifiers are left for moduleLoader to reject clearly at
 * runtime if actually reached, since installs aren't supported yet.
 */
const preloadModuleGraph = async (entryPath: string, readFile: ReadFile): Promise<PreloadResult> => {
  const sources: Record<string, string> = { [entryPath]: await readFile(entryPath) };
  const queue: string[] = [entryPath];
  const seen = new Set<string>([entryPath]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const source = sources[path];

    for (const specifier of extractRequireSpecifiers(source)) {
      if (specifier in builtinModules || !specifier.startsWith(".")) continue;

      const resolved = await tryReadFirstExisting(relativeModuleCandidates(path, specifier), readFile);
      if (!resolved || seen.has(resolved.path)) continue;

      seen.add(resolved.path);
      sources[resolved.path] = resolved.source;
      queue.push(resolved.path);
    }
  }

  return { sources };
};

export { preloadModuleGraph };
export type { PreloadResult, ReadFile };
