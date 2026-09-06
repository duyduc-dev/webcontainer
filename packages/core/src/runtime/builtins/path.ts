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

interface Win32Parsed {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
}

interface Win32Module {
  isAbsolute(path: string): boolean;
  parse(path: string): Win32Parsed;
}

interface PathModule {
  sep: string;
  delimiter: string;
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  normalize(path: string): string;
  extname(path: string): string;
  posix: PathModule;
  win32: Win32Module;
}

// `win32` genuinely needs Windows semantics, not a POSIX alias - this
// runtime never has real Windows paths to operate on, but a foreign
// tarball's entries might (traced need: real `tar`'s own
// lib/strip-absolute-path.js destructures `{ isAbsolute, parse } =
// require('path').win32` specifically to sanitize a tar-slip-style
// absolute path of EITHER flavor during extraction, regardless of host
// platform). Scoped to exactly those two functions - the rest of the
// win32 API isn't implemented since nothing traced needs it yet.
// UNC paths (\\server\share\...) are intentionally not handled: correctly
// parsing them adds real complexity for a form no traced caller produces.
const WIN32_DRIVE_ABSOLUTE = /^[a-zA-Z]:[\\/]/;
const WIN32_DRIVE_RELATIVE = /^[a-zA-Z]:(?![\\/])/;
const WIN32_LEADING_SEP = /^[\\/]/;

const win32IsAbsolute = (path: string): boolean => WIN32_LEADING_SEP.test(path) || WIN32_DRIVE_ABSOLUTE.test(path);

const win32Parse = (path: string): Win32Parsed => {
  let root = "";
  if (WIN32_LEADING_SEP.test(path)) root = path[0]!;
  else if (WIN32_DRIVE_ABSOLUTE.test(path)) root = path.slice(0, 3);
  else if (WIN32_DRIVE_RELATIVE.test(path)) root = path.slice(0, 2);

  const rest = path.slice(root.length);
  const base = rest.split(/[\\/]/).pop() ?? "";
  const dir = root + rest.slice(0, rest.length - base.length).replace(/[\\/]+$/, "");
  const extIndex = base.lastIndexOf(".");
  const ext = extIndex > 0 ? base.slice(extIndex) : "";
  const name = extIndex > 0 ? base.slice(0, extIndex) : base;
  return { root, dir, base, ext, name };
};

const pathModule = {
  sep,
  delimiter,
  join,
  resolve: resolvePath,
  dirname,
  basename,
  normalize,
  extname,
} as PathModule;

// Real Node always exposes both `path.posix` and `path.win32` regardless of
// host OS (code doing `const { posix } = require('path')`, e.g. real
// npm's own `which` dependency, expects `posix` to exist even on a POSIX
// host it's already running on). This VFS is POSIX-only - `posix` is a
// self-alias, not a second implementation.
pathModule.posix = pathModule;
pathModule.win32 = { isAbsolute: win32IsAbsolute, parse: win32Parse };

export default pathModule;
export { basename, delimiter, dirname, extname, join, normalize, resolvePath as resolve, sep };
