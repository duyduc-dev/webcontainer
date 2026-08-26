import { FSError } from "./FSError";
import { normalize, dirname, basename } from "./path";

type DirNode = { type: "dir"; children: Map<string, Node>; mtime: number };
type FileNode = { type: "file"; content: Uint8Array; mtime: number };
type Node = DirNode | FileNode;

export type FileStat = { type: "file" | "dir"; size: number; mtime: number };

function segmentsOf(normalizedPath: string): string[] {
  return normalizedPath === "/" ? [] : normalizedPath.slice(1).split("/");
}

export class VirtualFileSystem {
  private readonly root: DirNode = {
    type: "dir",
    children: new Map(),
    mtime: Date.now(),
  };

  private resolveNode(path: string): Node | undefined {
    const normalized = normalize(path);
    let current: Node = this.root;
    for (const segment of segmentsOf(normalized)) {
      if (current.type !== "dir") return undefined;
      const next = current.children.get(segment);
      if (!next) return undefined;
      current = next;
    }
    return current;
  }

  private getDir(path: string): DirNode {
    const node = this.resolveNode(path);
    if (!node) throw new FSError("ENOENT", path);
    if (node.type !== "dir") throw new FSError("ENOTDIR", path);
    return node;
  }

  exists(path: string): boolean {
    return this.resolveNode(path) !== undefined;
  }

  mkdir(path: string, opts?: { recursive?: boolean }): void {
    const normalized = normalize(path);
    if (normalized === "/") {
      if (opts?.recursive) return;
      throw new FSError("EEXIST", path);
    }

    if (opts?.recursive) {
      let current = this.root;
      let builtPath = "";
      for (const segment of segmentsOf(normalized)) {
        builtPath += `/${segment}`;
        let next = current.children.get(segment);
        if (!next) {
          next = { type: "dir", children: new Map(), mtime: Date.now() };
          current.children.set(segment, next);
        } else if (next.type !== "dir") {
          throw new FSError("ENOTDIR", builtPath);
        }
        current = next;
      }
      return;
    }

    const parent = this.getDir(dirname(normalized));
    const name = basename(normalized);
    if (parent.children.has(name)) throw new FSError("EEXIST", normalized);
    parent.children.set(name, {
      type: "dir",
      children: new Map(),
      mtime: Date.now(),
    });
  }

  writeFile(path: string, data: Uint8Array): void {
    const normalized = normalize(path);
    if (normalized === "/") throw new FSError("EISDIR", path);

    const parent = this.getDir(dirname(normalized));
    const name = basename(normalized);
    const existing = parent.children.get(name);
    if (existing?.type === "dir") throw new FSError("EISDIR", normalized);

    parent.children.set(name, {
      type: "file",
      content: data,
      mtime: Date.now(),
    });
  }

  readFile(path: string): Uint8Array {
    const node = this.resolveNode(path);
    if (!node) throw new FSError("ENOENT", path);
    if (node.type === "dir") throw new FSError("EISDIR", path);
    return node.content;
  }

  readdir(path: string): string[] {
    const node = this.resolveNode(path);
    if (!node) throw new FSError("ENOENT", path);
    if (node.type !== "dir") throw new FSError("ENOTDIR", path);
    return [...node.children.keys()];
  }

  stat(path: string): FileStat {
    const node = this.resolveNode(path);
    if (!node) throw new FSError("ENOENT", path);
    return node.type === "dir"
      ? { type: "dir", size: 0, mtime: node.mtime }
      : { type: "file", size: node.content.byteLength, mtime: node.mtime };
  }

  rm(path: string, opts?: { recursive?: boolean }): void {
    const normalized = normalize(path);
    if (normalized === "/")
      throw new FSError("EINVAL", path, "cannot remove root");

    const node = this.resolveNode(normalized);
    if (!node) throw new FSError("ENOENT", path);
    if (node.type === "dir" && node.children.size > 0 && !opts?.recursive) {
      throw new FSError("ENOTEMPTY", path);
    }

    const parent = this.getDir(dirname(normalized));
    parent.children.delete(basename(normalized));
  }

  rename(from: string, to: string): void {
    const normalizedFrom = normalize(from);
    const normalizedTo = normalize(to);
    if (normalizedFrom === "/")
      throw new FSError("EINVAL", from, "cannot rename root");

    const node = this.resolveNode(normalizedFrom);
    if (!node) throw new FSError("ENOENT", from);

    const toParent = this.getDir(dirname(normalizedTo));
    const toName = basename(normalizedTo);
    const existing = toParent.children.get(toName);
    if (existing && existing.type !== node.type) {
      throw new FSError(
        "EINVAL",
        to,
        "cannot rename across different node types",
      );
    }

    toParent.children.set(toName, node);
    const fromParent = this.getDir(dirname(normalizedFrom));
    fromParent.children.delete(basename(normalizedFrom));
  }
}
