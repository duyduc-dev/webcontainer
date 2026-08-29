import { FSError } from "../../../kernel/fs/FSError";
import { FsReaderWithReaddir } from "../../../kernel/fs/FsReader";

const UNSUPPORTED_MESSAGE =
  "not supported without cross-origin isolation — set COOP/COEP response headers on the host page to enable the full fs API";

// Backs the `fs` builtin when the guest booted over the static-preload
// fallback transport (no SharedArrayBuffer available, i.e. the host page
// isn't cross-origin-isolated): only literal paths preload.ts's regex scan
// discovered ahead of time are readable, and no stat/readdir metadata was
// ever captured by that scan.
export function createStaticFsClient(files: Map<string, string>): FsReaderWithReaddir {
  return {
    exists(path: string): boolean {
      return files.has(path);
    },
    readFile(path: string): Uint8Array {
      const content = files.get(path);
      if (content === undefined) {
        throw new FSError(
          "ENOENT",
          path,
          `ENOENT: no such file or directory, open '${path}' (only absolute literal paths discovered ahead of time are supported)`,
        );
      }
      return new TextEncoder().encode(content);
    },
    stat(path: string): never {
      throw new FSError("EINVAL", path, `statSync ${UNSUPPORTED_MESSAGE}`);
    },
    readdir(path: string): never {
      throw new FSError("EINVAL", path, `readdirSync ${UNSUPPORTED_MESSAGE}`);
    },
  };
}
