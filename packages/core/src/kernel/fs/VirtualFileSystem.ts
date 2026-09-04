import { FSError } from "./FSError";
import { normalize, segments as pathSegments } from "./path";

interface FileNode {
  type: "file";
  contents: Uint8Array;
  mtimeMs: number;
}

interface DirNode {
  type: "dir";
  children: Map<string, Node>;
  mtimeMs: number;
}

type Node = FileNode | DirNode;

interface Stat {
  isFile(): boolean;
  isDirectory(): boolean;
  size: number;
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
  rm(path: string, options?: RmOptions): void;
  rename(from: string, to: string): void;
  exists(path: string): boolean;
}

const encoder = new TextEncoder();

const createVirtualFileSystem = (): VirtualFileSystem => {
  const root: DirNode = { type: "dir", children: new Map(), mtimeMs: Date.now() };

  const resolveParent = (normalized: string): { parent: DirNode; name: string } => {
    const segs = pathSegments(normalized);
    if (segs.length === 0) {
      throw new FSError("EINVAL", normalized, "Cannot operate on the root directory");
    }

    const name = segs[segs.length - 1];
    let dir = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const child = dir.children.get(segs[i]);
      if (!child) throw new FSError("ENOENT", normalized);
      if (child.type !== "dir") throw new FSError("ENOTDIR", normalized);
      dir = child;
    }
    return { parent: dir, name };
  };

  const resolveNode = (normalized: string): Node => {
    let node: Node = root;
    for (const segment of pathSegments(normalized)) {
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
      parent.children.set(name, { type: "dir", children: new Map(), mtimeMs: Date.now() });
      return;
    }

    let dir = root;
    for (const segment of segs) {
      let child = dir.children.get(segment);
      if (!child) {
        child = { type: "dir", children: new Map(), mtimeMs: Date.now() };
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

    const bytes = typeof contents === "string" ? encoder.encode(contents) : contents;
    parent.children.set(name, { type: "file", contents: bytes, mtimeMs: Date.now() });
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

  const stat = (path: string): Stat => {
    const normalized = normalize(path);
    const node = resolveNode(normalized);
    return {
      isFile: () => node.type === "file",
      isDirectory: () => node.type === "dir",
      size: node.type === "file" ? node.contents.byteLength : 0,
      mtimeMs: node.mtimeMs,
    };
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

  return { mkdir, writeFile, readFile, readdir, stat, rm, rename, exists };
};

export { createVirtualFileSystem };
export type { DirNode, FileNode, MkdirOptions, Node, RmOptions, Stat, VirtualFileSystem };
