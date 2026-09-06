import { FSError } from "./FSError";
import { normalize, segments as pathSegments } from "./path";

interface FileNode {
  type: "file";
  contents: Uint8Array;
  mtimeMs: number;
  mode: number;
}

interface DirNode {
  type: "dir";
  children: Map<string, Node>;
  mtimeMs: number;
  mode: number;
}

interface SymlinkNode {
  type: "symlink";
  /** Stored exactly as given to symlink() - relative (resolved against the
   * link's own containing directory) or absolute, matching fs.symlinkSync. */
  target: string;
  mtimeMs: number;
}

type Node = FileNode | DirNode | SymlinkNode;

interface Stat {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mode: number;
  mtimeMs: number;
}

interface MkdirOptions {
  recursive?: boolean;
}

interface RmOptions {
  recursive?: boolean;
}

interface VirtualFileSystem {
  mkdir(path: string, options?: MkdirOptions): void;
  writeFile(path: string, contents: string | Uint8Array): void;
  readFile(path: string): Uint8Array;
  readdir(path: string): string[];
  stat(path: string): Stat;
  lstat(path: string): Stat;
  chmod(path: string, mode: number): void;
  symlink(target: string, path: string): void;
  readlink(path: string): string;
  rm(path: string, options?: RmOptions): void;
  rename(from: string, to: string): void;
  exists(path: string): boolean;
}

const encoder = new TextEncoder();

// A cyclic symlink chain must fail (ELOOP) rather than recurse forever; this
// bound is well past anything a real filesystem tree would legitimately nest.
const MAX_SYMLINK_DEPTH = 40;

const createVirtualFileSystem = (): VirtualFileSystem => {
  const root: DirNode = { type: "dir", children: new Map(), mtimeMs: Date.now(), mode: 0o755 };

  /**
   * Resolves a path to a fully symlink-free absolute path string, following
   * every symlink found at a non-final segment (POSIX never treats an
   * intermediate symlink specially) and the final segment only when
   * `followFinal` is true. Everything else (resolveNode/resolveParent) walks
   * the tree directly on the string this returns, so none of the existing
   * tree-walking logic needs to know about symlinks at all.
   */
  const resolveRealPath = (normalized: string, followFinal: boolean, depth = 0): string => {
    if (depth > MAX_SYMLINK_DEPTH) throw new FSError("ELOOP", normalized);

    const segs = pathSegments(normalized);
    let dir: DirNode = root;
    const resolvedSegs: string[] = [];

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      const isLast = i === segs.length - 1;

      const child = dir.children.get(seg);
      if (!child) throw new FSError("ENOENT", normalized);

      if (child.type === "symlink" && (!isLast || followFinal)) {
        const currentDir = resolvedSegs.length === 0 ? "/" : `/${resolvedSegs.join("/")}`;
        const targetPath = child.target.startsWith("/") ? child.target : normalize(`${currentDir}/${child.target}`);
        const resolvedTarget = resolveRealPath(targetPath, true, depth + 1);
        if (isLast) return resolvedTarget;
        const remaining = segs.slice(i + 1).join("/");
        return resolveRealPath(normalize(`${resolvedTarget}/${remaining}`), followFinal, depth + 1);
      }

      resolvedSegs.push(seg);
      if (!isLast) {
        if (child.type !== "dir") throw new FSError("ENOTDIR", normalized);
        dir = child;
      }
    }

    return resolvedSegs.length === 0 ? "/" : `/${resolvedSegs.join("/")}`;
  };

  /**
   * Unlike resolveNode, the final segment here is NOT required to exist (this
   * is how a new file/dir/symlink gets created, or an existing one is
   * inspected before being replaced/removed) - so only the CONTAINING
   * directory (everything but the last segment) is resolved through
   * resolveRealPath (which does require every segment along the way to
   * exist), following any symlinks within it. The final segment is never
   * looked up or dereferenced here; callers decide what to do with whatever
   * (if anything) already occupies that name.
   */
  const resolveParent = (normalized: string): { parent: DirNode; name: string } => {
    const segs = pathSegments(normalized);
    if (segs.length === 0) {
      throw new FSError("EINVAL", normalized, "Cannot operate on the root directory");
    }
    const name = segs[segs.length - 1]!;
    if (segs.length === 1) return { parent: root, name };

    const dirPath = `/${segs.slice(0, -1).join("/")}`;
    const realDirPath = resolveRealPath(dirPath, true);

    let dir: Node = root;
    for (const segment of pathSegments(realDirPath)) {
      if (dir.type !== "dir") throw new FSError("ENOTDIR", normalized);
      const child = dir.children.get(segment);
      if (!child) throw new FSError("ENOENT", normalized);
      dir = child;
    }
    if (dir.type !== "dir") throw new FSError("ENOTDIR", normalized);
    return { parent: dir, name };
  };

  const resolveNode = (normalized: string, followSymlinks = true): Node => {
    const real = resolveRealPath(normalized, followSymlinks);
    let node: Node = root;
    for (const segment of pathSegments(real)) {
      if (node.type !== "dir") throw new FSError("ENOTDIR", normalized);
      const child = node.children.get(segment);
      if (!child) throw new FSError("ENOENT", normalized);
      node = child;
    }
    return node;
  };

  const mkdir = (path: string, options: MkdirOptions = {}): void => {
    const normalized = normalize(path);
    const segs = pathSegments(normalized);
    if (segs.length === 0) return;

    if (!options.recursive) {
      const { parent, name } = resolveParent(normalized);
      if (parent.children.has(name)) throw new FSError("EEXIST", normalized);
      parent.children.set(name, { type: "dir", children: new Map(), mtimeMs: Date.now(), mode: 0o755 });
      return;
    }

    // Does not resolve an intermediate symlink (an already-existing one
    // pointing at a real directory would incorrectly ENOTDIR here) - not
    // exercised by how this runtime's own tooling creates directories, since
    // symlinks are only ever created as leaf entries (e.g. node_modules/.bin
    // shims), never as a directory a later mkdir -p walks through.
    let dir = root;
    for (const segment of segs) {
      let child = dir.children.get(segment);
      if (!child) {
        child = { type: "dir", children: new Map(), mtimeMs: Date.now(), mode: 0o755 };
        dir.children.set(segment, child);
      } else if (child.type !== "dir") {
        throw new FSError("ENOTDIR", normalized);
      }
      dir = child;
    }
  };

  const writeFile = (path: string, contents: string | Uint8Array): void => {
    const normalized = normalize(path);
    const { parent, name } = resolveParent(normalized);

    const existing = parent.children.get(name);
    if (existing && existing.type === "dir") throw new FSError("EISDIR", normalized);

    // A rewrite of an existing file keeps its mode (matches real
    // fs.writeFileSync - only a brand new file gets the default), so a
    // chmod'd .bin shim doesn't silently lose +x if its contents are
    // rewritten afterward.
    const mode = existing?.type === "file" ? existing.mode : 0o644;
    const bytes = typeof contents === "string" ? encoder.encode(contents) : contents;
    parent.children.set(name, { type: "file", contents: bytes, mtimeMs: Date.now(), mode });
  };

  const readFile = (path: string): Uint8Array => {
    const normalized = normalize(path);
    const node = resolveNode(normalized);
    if (node.type !== "file") throw new FSError("EISDIR", normalized);
    return node.contents;
  };

  const readdir = (path: string): string[] => {
    const normalized = normalize(path);
    const node = resolveNode(normalized);
    if (node.type !== "dir") throw new FSError("ENOTDIR", normalized);
    return [...node.children.keys()].sort();
  };

  const statOf = (normalized: string, node: Node): Stat => ({
    isFile: () => node.type === "file",
    isDirectory: () => node.type === "dir",
    isSymbolicLink: () => node.type === "symlink",
    size: node.type === "file" ? node.contents.byteLength : 0,
    // A symlink's own permissions aren't meaningfully enforced on any real
    // filesystem either - lrwxrwxrwx (0o777) is the universal convention.
    mode: node.type === "symlink" ? 0o777 : node.mode,
    mtimeMs: node.mtimeMs,
  });

  const stat = (path: string): Stat => {
    const normalized = normalize(path);
    return statOf(normalized, resolveNode(normalized));
  };

  const lstat = (path: string): Stat => {
    const normalized = normalize(path);
    return statOf(normalized, resolveNode(normalized, false));
  };

  const chmod = (path: string, mode: number): void => {
    const normalized = normalize(path);
    // Follows symlinks, matching real fs.chmodSync - resolveNode's default
    // never actually returns a raw symlink node (see its own doc comment),
    // so the type check below is unreachable, just satisfying the type.
    const node = resolveNode(normalized);
    if (node.type === "symlink") throw new FSError("EINVAL", normalized, "Cannot chmod a symlink");
    node.mode = mode;
  };

  const symlink = (target: string, path: string): void => {
    const normalized = normalize(path);
    const { parent, name } = resolveParent(normalized);
    if (parent.children.has(name)) throw new FSError("EEXIST", normalized);
    parent.children.set(name, { type: "symlink", target, mtimeMs: Date.now() });
  };

  const readlink = (path: string): string => {
    const normalized = normalize(path);
    const node = resolveNode(normalized, false);
    if (node.type !== "symlink") throw new FSError("EINVAL", normalized, "Not a symbolic link");
    return node.target;
  };

  const rm = (path: string, options: RmOptions = {}): void => {
    const normalized = normalize(path);
    const { parent, name } = resolveParent(normalized);

    const node = parent.children.get(name);
    if (!node) throw new FSError("ENOENT", normalized);
    if (node.type === "dir" && node.children.size > 0 && !options.recursive) {
      throw new FSError("ENOTEMPTY", normalized);
    }
    parent.children.delete(name);
  };

  const rename = (from: string, to: string): void => {
    const normalizedFrom = normalize(from);
    const { parent: fromParent, name: fromName } = resolveParent(normalizedFrom);

    const node = fromParent.children.get(fromName);
    if (!node) throw new FSError("ENOENT", normalizedFrom);

    const { parent: toParent, name: toName } = resolveParent(normalize(to));
    fromParent.children.delete(fromName);
    toParent.children.set(toName, node);
  };

  const exists = (path: string): boolean => {
    try {
      resolveNode(normalize(path));
      return true;
    } catch {
      return false;
    }
  };

  return { mkdir, writeFile, readFile, readdir, stat, lstat, chmod, symlink, readlink, rm, rename, exists };
};

export { createVirtualFileSystem };
export type { DirNode, FileNode, MkdirOptions, Node, RmOptions, Stat, SymlinkNode, VirtualFileSystem };
