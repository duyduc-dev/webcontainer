import { basename, dirname, normalize } from "../../kernel/fs/path";

const sep = "/";

const join = (...parts: string[]): string => normalize(parts.join("/"));

const resolvePath = (...parts: string[]): string => {
  let resolved = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (!part) continue;
    resolved = resolved ? `${part}/${resolved}` : part;
    if (part.startsWith("/")) break;
  }
  return normalize(resolved.startsWith("/") ? resolved : `/${resolved}`);
};

const extname = (path: string): string => {
  const base = basename(path);
  const index = base.lastIndexOf(".");
  return index <= 0 ? "" : base.slice(index);
};

const pathModule = { sep, join, resolve: resolvePath, dirname, basename, normalize, extname };

export default pathModule;
export { basename, dirname, extname, join, normalize, resolvePath as resolve, sep };
