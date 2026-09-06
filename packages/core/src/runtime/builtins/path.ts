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

// Real Node's path.relative(from, to) - traced need: real npm's own
// @npmcli/arborist Node class computes each node's `location` off of
// `relative(root.realpath, this.realpath)`. Both inputs are resolved
// against root ("/", the only "cwd" this VFS has - see resolvePath's own
// no-real-cwd design) before comparing path segments, matching real Node's
// POSIX algorithm (find the longest common prefix, ".." out of `from` for
// what's left, then descend into `to`'s remaining segments).
const relative = (from: string, to: string): string => {
  const fromParts = resolvePath(from).slice(1).split("/").filter(Boolean);
  const toParts = resolvePath(to).slice(1).split("/").filter(Boolean);
  const maxCommon = Math.min(fromParts.length, toParts.length);
  let commonLength = 0;
  while (commonLength < maxCommon && fromParts[commonLength] === toParts[commonLength]) commonLength++;
  const upSegments = fromParts.slice(commonLength).map(() => "..");
  return [...upSegments, ...toParts.slice(commonLength)].join("/");
};

const extname = (path: string): string => {
  const base = basename(path);
  const index = base.lastIndexOf(".");
  return index <= 0 ? "" : base.slice(index);
};

// Real Node's POSIX path.isAbsolute(path) - traced need: real tar's own
// lib/unpack.js checks `path.isAbsolute(entry.path)` (the bare, non-win32
// import) while sanitizing a tar-slip-style absolute entry path during
// extraction.
const isAbsolute = (path: string): boolean => path.startsWith("/");

// Real Node's POSIX path.parse(path) - traced need: real npm's own
// @npmcli/arborist ships a vendored common-ancestor-path.js that calls
// `require('path').parse(...)` directly (not path.posix.parse, though this
// runtime's posix is a self-alias of the default export anyway).
const parse = (path: string): Win32Parsed => {
  const root = path.startsWith("/") ? "/" : "";
  const rest = path.slice(root.length);
  const base = rest.split("/").pop() ?? "";
  const dir = root + rest.slice(0, rest.length - base.length).replace(/\/+$/, "");
  const extIndex = base.lastIndexOf(".");
  const ext = extIndex > 0 ? base.slice(extIndex) : "";
  const name = extIndex > 0 ? base.slice(0, extIndex) : base;
  return { root, dir, base, ext, name };
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
  isAbsolute(path: string): boolean;
  relative(from: string, to: string): string;
  parse(path: string): Win32Parsed;
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
  isAbsolute,
  relative,
  parse,
} as PathModule;

// Real Node always exposes both `path.posix` and `path.win32` regardless of
// host OS (code doing `const { posix } = require('path')`, e.g. real
// npm's own `which` dependency, expects `posix` to exist even on a POSIX
// host it's already running on). This VFS is POSIX-only - `posix` is a
// self-alias, not a second implementation.
pathModule.posix = pathModule;
pathModule.win32 = { isAbsolute: win32IsAbsolute, parse: win32Parse };

export default pathModule;
export { basename, delimiter, dirname, extname, isAbsolute, join, normalize, parse, relative, resolvePath as resolve, sep };
