import type { VirtualFileSystem } from "./VirtualFileSystem";

interface FileEntry {
  file: { contents: string | Uint8Array };
}

interface DirectoryEntry {
  directory: FileSystemTree;
}

type FileSystemTree = Record<string, FileEntry | DirectoryEntry>;

const isFileEntry = (entry: FileEntry | DirectoryEntry): entry is FileEntry => "file" in entry;

/** Applies a WebContainer-compatible declarative tree to a VFS in one synchronous pass. */
const mount = (vfs: VirtualFileSystem, tree: FileSystemTree, basePath = "/"): void => {
  const prefix = basePath === "/" ? "" : basePath;

  for (const [name, entry] of Object.entries(tree)) {
    const path = `${prefix}/${name}`;

    if (isFileEntry(entry)) {
      vfs.writeFile(path, entry.file.contents);
    } else {
      vfs.mkdir(path, { recursive: true });
      mount(vfs, entry.directory, path);
    }
  }
};

export { mount };
export type { DirectoryEntry, FileEntry, FileSystemTree };
