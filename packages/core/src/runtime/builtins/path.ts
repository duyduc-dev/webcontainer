import { basename, dirname, normalize } from "../../kernel/fs/path";

const sep = "/";
const delimiter = ":";

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

const pathModule = { sep, delimiter, join, resolve: resolvePath, dirname, basename, normalize, extname };

// Real Node always exposes both `path.posix` and `path.win32` regardless of
// host OS (code doing `const { posix } = require('path')`, e.g. real
// npm's own `which` dependency, expects `posix` to exist even on a POSIX
// host it's already running on). This VFS is POSIX-only - `posix` is a
// self-alias, not a second implementation; `win32` isn't needed by anything
// traced so far and is left unset rather than guessed at.
Object.assign(pathModule, { posix: pathModule });

export default pathModule;
export { basename, delimiter, dirname, extname, join, normalize, resolvePath as resolve, sep };
