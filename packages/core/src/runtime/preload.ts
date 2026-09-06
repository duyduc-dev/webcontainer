import { normalize } from "../kernel/fs/path";
import { isBuiltinSpecifier } from "./builtins";
import { fileCandidates, nodeModulesDirsFrom, relativeModuleCandidates, splitBareSpecifier } from "./resolveSpecifier";

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
 * Resolves a bare (node_modules) specifier the way Node actually does, minus
 * package.json "exports"/"imports" (a separate, more involved algorithm — see
 * resolveSpecifier.ts's header): walk node_modules directories closest-first;
 * a subpath (`pkg/sub`) resolves directly under the package directory (never
 * through "main"); a bare package root reads package.json's "main" field
 * (falling back to "index.js" when package.json is missing or unreadable) and
 * resolves that. Any package.json read along the way is also stored into
 * `sources`, since moduleLoader.ts's sync require() has to redo this same
 * "main" lookup at runtime against the now-fully-populated in-memory map.
 */
const resolveBareSpecifier = async (
  fromPath: string,
  specifier: string,
  readFile: ReadFile,
  sources: Record<string, string>,
): Promise<{ path: string; source: string } | null> => {
  const { packageName, subpath } = splitBareSpecifier(specifier);

  for (const nodeModulesDir of nodeModulesDirsFrom(fromPath)) {
    const pkgDir = `${nodeModulesDir}/${packageName}`;

    if (subpath) {
      const resolved = await tryReadFirstExisting(fileCandidates(`${pkgDir}/${subpath}`), readFile);
      if (resolved) return resolved;
      continue;
    }

    let main = "index.js";
    try {
      const pkgJsonPath = `${pkgDir}/package.json`;
      const pkgJsonSource = await readFile(pkgJsonPath);
      sources[pkgJsonPath] = pkgJsonSource;
      main = (JSON.parse(pkgJsonSource) as { main?: string }).main ?? "index.js";
    } catch {
      // No (or unreadable/invalid) package.json - real Node falls back to a
      // plain index.js in the package directory, tried below either way.
    }

    const resolved = await tryReadFirstExisting(fileCandidates(normalize(`${pkgDir}/${main}`)), readFile);
    if (resolved) return resolved;
  }

  return null;
};

/**
 * Best-effort, regex-based ahead-of-boot scan of the require() graph reachable from
 * entryPath, against the FS worker (via the injected readFile). Relative specifiers
 * resolve against the requiring file's directory; bare specifiers resolve via
 * resolveBareSpecifier() above; builtins are skipped (served locally in the process
 * worker). An unresolved specifier (relative or bare) is silently skipped rather
 * than thrown here - moduleLoader.ts is the authoritative place a "Cannot find
 * module" error is raised, at the point the guest script actually calls require().
 */
const preloadModuleGraph = async (entryPath: string, readFile: ReadFile): Promise<PreloadResult> => {
  const sources: Record<string, string> = { [entryPath]: await readFile(entryPath) };
  const queue: string[] = [entryPath];
  const seen = new Set<string>([entryPath]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const source = sources[path];

    for (const specifier of extractRequireSpecifiers(source)) {
      if (isBuiltinSpecifier(specifier)) continue;

      const resolved = specifier.startsWith(".")
        ? await tryReadFirstExisting(relativeModuleCandidates(path, specifier), readFile)
        : await resolveBareSpecifier(path, specifier, readFile, sources);
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
