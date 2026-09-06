import { DWCError, ERR_NOT_ISOLATED } from "../../protocol/errors";
import { FsOp } from "../../kernel/fs/syncWireFormat";
import type { FsRequest, FsResponseOk } from "../../kernel/fs/syncWireFormat";

interface FsBuiltinIO {
  callSync?(request: FsRequest): FsResponseOk;
}

interface StatResult {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mode: number;
  mtimeMs: number;
}

interface FsBuiltin {
  readFileSync(path: string): Uint8Array;
  writeFileSync(path: string, contents: string | Uint8Array): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdirSync(path: string): string[];
  statSync(path: string): StatResult;
  lstatSync(path: string): StatResult;
  chmodSync(path: string, mode: number): void;
  symlinkSync(target: string, path: string): void;
  readlinkSync(path: string): string;
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
      const response = call({ op: FsOp.STAT, path }) as Extract<FsResponseOk, { op: FsOp.STAT | FsOp.LSTAT }>;
      return {
        isFile: () => response.isFile,
        isDirectory: () => response.isDirectory,
        isSymbolicLink: () => response.isSymbolicLink,
        size: response.size,
        mode: response.mode,
        mtimeMs: response.mtimeMs,
      };
    },
    lstatSync(path) {
      const response = call({ op: FsOp.LSTAT, path }) as Extract<FsResponseOk, { op: FsOp.STAT | FsOp.LSTAT }>;
      return {
        isFile: () => response.isFile,
        isDirectory: () => response.isDirectory,
        isSymbolicLink: () => response.isSymbolicLink,
        size: response.size,
        mode: response.mode,
        mtimeMs: response.mtimeMs,
      };
    },
    chmodSync(path, mode) {
      call({ op: FsOp.CHMOD, path, mode });
    },
    symlinkSync(target, path) {
      call({ op: FsOp.SYMLINK, target, path });
    },
    readlinkSync(path) {
      const response = call({ op: FsOp.READLINK, path }) as Extract<FsResponseOk, { op: FsOp.READLINK }>;
      return response.target;
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
