import { dirname, normalize, segments } from "../kernel/fs/path";

const CANDIDATE_SUFFIXES = ["", ".js", ".json", "/index.js"];

/** Candidate resolved paths for a base path with no known extension, in
 * priority order — shared by relative requires and by both the "main" field
 * and subpath resolution of a bare (node_modules) specifier below. */
const fileCandidates = (basePath: string): string[] => CANDIDATE_SUFFIXES.map((suffix) => `${basePath}${suffix}`);

/** Candidate resolved paths for a relative require() specifier, in priority order. */
const relativeModuleCandidates = (fromPath: string, specifier: string): string[] => {
  const joined = normalize(`${dirname(fromPath)}/${specifier}`);
  return fileCandidates(joined);
};

/** Splits a bare specifier into its package name and subpath, honoring scoped
 * packages (`@org/pkg` is the package name; `@org/pkg/sub` -> subpath `sub`). */
const splitBareSpecifier = (specifier: string): { packageName: string; subpath: string } => {
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    return { packageName: parts.slice(0, 2).join("/"), subpath: parts.slice(2).join("/") };
  }
  return { packageName: parts[0]!, subpath: parts.slice(1).join("/") };
};

/** The `node_modules` directories to check for a bare specifier required from
 * `fromPath`, closest first — Node's real NODE_MODULES_PATHS algorithm: walk
 * up from fromPath's directory to the root, adding `<dir>/node_modules` at
 * each level, except a directory that is itself already named `node_modules`
 * (its own node_modules is the same one two levels up, and checking `.../
 * node_modules/node_modules` would be pointless). */
const nodeModulesDirsFrom = (fromPath: string): string[] => {
  const dirs: string[] = [];
  let dir = dirname(fromPath);

  for (;;) {
    const dirSegments = segments(dir);
    if (dirSegments[dirSegments.length - 1] !== "node_modules") {
      dirs.push(dir === "/" ? "/node_modules" : `${dir}/node_modules`);
    }
    if (dir === "/") break;
    dir = dirname(dir);
  }

  return dirs;
};

/** Condition order for resolving a package.json "exports" map entry from a
 * genuinely-native-`import()`-evaluated ESM module (see esmLoader.ts) -
 * "import" before "default" is real ESM's own spec order. This is the
 * OPPOSITE of what a require()-everything system would want (there,
 * "default" before "import" resolves dual packages to their CJS build) -
 * deliberately not shared with the CJS resolver above, which has no
 * "exports" map support at all (main-field + subpath only). */
const ESM_EXPORT_CONDITIONS = ["node", "import", "default"];

/** Condition order for resolving a package.json "exports" map entry from a
 * CommonJS require() - "require" before "default" (the OPPOSITE of
 * ESM_EXPORT_CONDITIONS's "import" preference), matching real Node: a dual-
 * published package's "exports" map exists specifically to route require()
 * and import() to different files ({".": {"import": "...esm.js", "require":
 * "...cjs.js"}}) - picking "import" from a require() call site would hand
 * CJS code a real ESM file it can't evaluate. Traced need: real
 * @napi-rs/wasm-runtime (a rolldown-vite dependency, reached via its own
 * WebContainer WASM fallback - see module.ts's doc comment on
 * process.versions.webcontainer) ships NO "main" field at all, only this
 * exact exports shape - moduleLoader.ts's require() had no way to find it. */
const CJS_EXPORT_CONDITIONS = ["node", "require", "default"];

/**
 * Resolves one subpath ("." for the package root, "./foo" for a subpath)
 * against a package.json "exports" field value under ESM_EXPORT_CONDITIONS.
 * Returns null if the subpath is explicitly blocked (an "exports" value of
 * `null`, real Node's way of hiding an internal file from consumers) or
 * simply not present - callers treat both the same way (not resolvable).
 *
 * Handles: a bare string (only valid for "."), a subpath map (keys are all
 * "."-prefixed, including "./*" wildcards - longest, most specific pattern
 * wins, matching real Node), and a bare conditions object (keys are
 * condition names, applies to "." only). Nested condition objects as
 * subpath-map values are supported (e.g. real rollup's own
 * `"./loadConfigFile": { "require": "...", "default": "..." }`). Deeper
 * edge cases - conditional arrays as ordered fallback lists, "exports"
 * self-referencing the owning package's own name from within itself - are
 * out of scope (see the plan this shipped under).
 */
const resolveExportsMap = (exportsField: unknown, subpath: string, conditions: readonly string[] = ESM_EXPORT_CONDITIONS): string | null => {
  if (typeof exportsField === "string") {
    return subpath === "." ? exportsField : null;
  }
  if (!exportsField || typeof exportsField !== "object" || Array.isArray(exportsField)) return null;

  const pickCondition = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    if (value === null) return null;
    if (Array.isArray(value)) {
      for (const candidate of value) {
        const resolved = pickCondition(candidate);
        if (resolved !== null) return resolved;
      }
      return null;
    }
    if (value && typeof value === "object") {
      const conditionMap = value as Record<string, unknown>;
      for (const condition of conditions) {
        if (condition in conditionMap) return pickCondition(conditionMap[condition]);
      }
    }
    return null;
  };

  const map = exportsField as Record<string, unknown>;
  const isSubpathMap = Object.keys(map).every((key) => key.startsWith("."));

  if (!isSubpathMap) {
    // A bare conditions object at the package root - only valid for ".".
    return subpath === "." ? pickCondition(map) : null;
  }

  if (subpath in map) return pickCondition(map[subpath]);

  // Wildcard subpaths ("./dist/*": "./dist/*") - longest (most specific)
  // pattern wins, matching real Node's own tie-breaking rule.
  let best: { pattern: string; target: string } | null = null;
  for (const pattern of Object.keys(map)) {
    const starIndex = pattern.indexOf("*");
    if (starIndex === -1) continue;
    const prefix = pattern.slice(0, starIndex);
    const suffix = pattern.slice(starIndex + 1);
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    if (subpath.length < prefix.length + suffix.length) continue;
    if (best && pattern.length <= best.pattern.length) continue;

    const resolved = pickCondition(map[pattern]);
    if (resolved === null) continue;
    const matched = subpath.slice(prefix.length, subpath.length - suffix.length);
    best = { pattern, target: resolved.replace("*", matched) };
  }
  return best?.target ?? null;
};

export { CJS_EXPORT_CONDITIONS, fileCandidates, nodeModulesDirsFrom, relativeModuleCandidates, resolveExportsMap, splitBareSpecifier };
