import { normalize } from "../kernel/fs/path";

const resolvePath = (cwd: string, path: string): string => (path.startsWith("/") ? normalize(path) : normalize(`${cwd}/${path}`));

export { resolvePath };
