import { isAbsolute, join, normalize } from "../fs/path";

export function resolvePath(cwd: string, input: string): string {
  return isAbsolute(input) ? normalize(input) : join(cwd, input);
}
