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

/** Guest `fs/promises` (and `fs.promises`) builtin - real Node's Promise-
 * based fs API. Every method here just wraps the matching `*Sync` method
 * from an already-constructed FsBuiltin in a resolved/rejected Promise: the
 * underlying sync fs bridge already blocks the calling worker thread for
 * the round-trip regardless (Phase 5's SharedArrayBuffer bridge), so there's
 * no real async I/O to do here - only the calling convention differs, which
 * is exactly what code reaching for `fs/promises` over `fs` wants (e.g. real
 * npm's own @npmcli/config, traced via its actual `require('fs/promises')`).
 *
 * Deliberately NOT a bare `async (path) => fs.xSync(path)`: that resolves via
 * a native microtask the event loop (runtime/eventLoop.ts) never sees, so
 * `hasPendingWork()` can read false and drain() tear the whole process down
 * BEFORE that microtask's continuation ever runs - exactly the failure mode
 * `net`'s own ref()/unref() calls already exist to prevent for network
 * requests (see worker.ts's own comment on that), just hit here for fs
 * instead (traced need: real npm's own `await fs.mkdir(...)`/`isexe`'s
 * `await fs.promises.stat(...)` silently never completing). Routing the
 * resolution through the same tracked `nextTick` guest code's own
 * process.nextTick() uses keeps it visible to hasPendingWork() for the
 * round-trip's duration.
 *
 * `access()` is fs.promises' own real method (there's no promise-based
 * `exists`) - resolves if the path exists, rejects (matching real Node's
 * ENOENT) otherwise. */
const createFsPromisesBuiltin = (fs: FsBuiltin, nextTick: (callback: () => void) => void) => {
  const toPromise = <T>(run: () => T): Promise<T> =>
    new Promise((resolve, reject) => {
      nextTick(() => {
        try {
          resolve(run());
        } catch (error) {
          reject(error);
        }
      });
    });

  return {
    readFile: (path: string) => toPromise(() => fs.readFileSync(path)),
    writeFile: (path: string, contents: string | Uint8Array) => toPromise(() => fs.writeFileSync(path, contents)),
    mkdir: (path: string, options?: { recursive?: boolean }) => toPromise(() => fs.mkdirSync(path, options)),
    readdir: (path: string) => toPromise(() => fs.readdirSync(path)),
    stat: (path: string) => toPromise(() => fs.statSync(path)),
    lstat: (path: string) => toPromise(() => fs.lstatSync(path)),
    chmod: (path: string, mode: number) => toPromise(() => fs.chmodSync(path, mode)),
    symlink: (target: string, path: string) => toPromise(() => fs.symlinkSync(target, path)),
    readlink: (path: string) => toPromise(() => fs.readlinkSync(path)),
    rm: (path: string, options?: { recursive?: boolean }) => toPromise(() => fs.rmSync(path, options)),
    rename: (from: string, to: string) => toPromise(() => fs.renameSync(from, to)),
    // No boolean-returning "exists" on real fs.promises - access() resolves
    // or rejects. statSync() already throws the correct ENOENT/FSError for a
    // missing path; reused here instead of fabricating a separate error.
    access: (path: string) =>
      toPromise(() => {
        fs.statSync(path);
      }),
  };
};

export { createFsBuiltin, createFsPromisesBuiltin };
export type { FsBuiltin, FsBuiltinIO };
