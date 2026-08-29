import { FileStat } from "./VirtualFileSystem";

// Narrow, read-only view of a filesystem. `VirtualFileSystem` satisfies this
// structurally with no changes — it lets module resolution (resolve.ts) run
// unmodified against either the real kernel VFS or a guest-side client that
// reaches it over the synchronous SharedArrayBuffer bridge.
export interface FsReader {
  exists(path: string): boolean;
  stat(path: string): FileStat;
  readFile(path: string): Uint8Array;
}

export interface FsReaderWithReaddir extends FsReader {
  readdir(path: string): string[];
}
