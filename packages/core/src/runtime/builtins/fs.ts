import { DWCError, ERR_NOT_ISOLATED } from "../../protocol/errors";
import { FsOp } from "../../kernel/fs/syncWireFormat";
import type { FsRequest, FsResponseOk } from "../../kernel/fs/syncWireFormat";

interface FsBuiltinIO {
  callSync?(request: FsRequest): FsResponseOk;
}

interface StatResult {
  isFile(): boolean;
  isDirectory(): boolean;
  size: number;
  mtimeMs: number;
}

interface FsBuiltin {
  readFileSync(path: string): Uint8Array;
  writeFileSync(path: string, contents: string | Uint8Array): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdirSync(path: string): string[];
  statSync(path: string): StatResult;
  rmSync(path: string, options?: { recursive?: boolean }): void;
  renameSync(from: string, to: string): void;
  existsSync(path: string): boolean;
}

const requireSyncChannel = (io: FsBuiltinIO): NonNullable<FsBuiltinIO["callSync"]> => {
  if (!io.callSync) {
    throw new DWCError(
      ERR_NOT_ISOLATED,
      "Synchronous fs calls require cross-origin isolation (COOP/COEP)",
    );
  }
  return io.callSync;
};

/** Guest `fs` builtin - only *Sync methods are supported until an async relay lands in a later phase. */
const createFsBuiltin = (io: FsBuiltinIO): FsBuiltin => {
  const call = (request: FsRequest): FsResponseOk => requireSyncChannel(io)(request);

  return {
    readFileSync(path) {
      const response = call({ op: FsOp.READ_FILE, path }) as Extract<FsResponseOk, { op: FsOp.READ_FILE }>;
      return response.contents;
    },
    writeFileSync(path, contents) {
      const bytes = typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
      call({ op: FsOp.WRITE_FILE, path, contents: bytes });
    },
    mkdirSync(path, options = {}) {
      call({ op: FsOp.MKDIR, path, recursive: options.recursive ?? false });
    },
    readdirSync(path) {
      const response = call({ op: FsOp.READDIR, path }) as Extract<FsResponseOk, { op: FsOp.READDIR }>;
      return response.entries;
    },
    statSync(path) {
      const response = call({ op: FsOp.STAT, path }) as Extract<FsResponseOk, { op: FsOp.STAT }>;
      return {
        isFile: () => response.isFile,
        isDirectory: () => response.isDirectory,
        size: response.size,
        mtimeMs: response.mtimeMs,
      };
    },
    rmSync(path, options = {}) {
      call({ op: FsOp.RM, path, recursive: options.recursive ?? false });
    },
    renameSync(from, to) {
      call({ op: FsOp.RENAME, from, to });
    },
    existsSync(path) {
      const response = call({ op: FsOp.EXISTS, path }) as Extract<FsResponseOk, { op: FsOp.EXISTS }>;
      return response.exists;
    },
  };
};

export { createFsBuiltin };
export type { FsBuiltin, FsBuiltinIO };
