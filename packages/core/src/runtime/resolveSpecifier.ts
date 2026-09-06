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

export { fileCandidates, nodeModulesDirsFrom, relativeModuleCandidates, splitBareSpecifier };
