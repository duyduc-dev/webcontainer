import { FsReaderWithReaddir } from "../../../kernel/fs/FsReader";

// A read-only, synchronous `fs` shim backed by whichever FsReader the guest
// was booted with — either live round trips to the kernel's VirtualFileSystem
// (sync transport) or a snapshot of literal paths discovered ahead of time by
// preload.ts's static scan (fallback transport, when COOP/COEP aren't set).
// Errors propagate as real FSError instances straight from the client.
export function createFsModule(client: FsReaderWithReaddir) {
  return {
    readFileSync(path: string, encoding?: string): string | Uint8Array {
      const content = client.readFile(path);
      return encoding ? new TextDecoder().decode(content) : content;
    },
    existsSync(path: string): boolean {
      return client.exists(path);
    },
    statSync(path: string) {
      const stat = client.stat(path);
      return {
        isFile: () => stat.type === "file",
        isDirectory: () => stat.type === "dir",
        size: stat.size,
        mtimeMs: stat.mtime,
      };
    },
    readdirSync(path: string): string[] {
      return client.readdir(path);
    },
  };
}
