import { dirname, normalize } from "../kernel/fs/path";

const CANDIDATE_SUFFIXES = ["", ".js", ".json", "/index.js"];

/** Candidate resolved paths for a relative require() specifier, in priority order. */
const relativeModuleCandidates = (fromPath: string, specifier: string): string[] => {
  const joined = normalize(`${dirname(fromPath)}/${specifier}`);
  return CANDIDATE_SUFFIXES.map((suffix) => `${joined}${suffix}`);
};

export { relativeModuleCandidates };
