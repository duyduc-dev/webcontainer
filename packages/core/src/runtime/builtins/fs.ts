import { DWCError, ERR_NOT_ISOLATED } from "../../protocol/errors";
import { FsOp } from "../../kernel/fs/syncWireFormat";
import type { FsRequest, FsResponseOk } from "../../kernel/fs/syncWireFormat";
import { createConstantsModule } from "./constants";

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

/** Real Node callback convention: `(error, result)` - `result` is omitted
 * (not just `undefined`) on the error branch, hence optional here. */
type NodeCallback<T> = (error: unknown, result?: T) => void;

interface FsBuiltinCore {
  // Real Node's `fs.constants` is the exact same set of flags
  // `require('constants')` exposes (that module's own doc comment already
  // calls this out as "a deprecated legacy alias for fs.constants") - traced
  // need: real tar's own lib/get-write-flag.js destructures
  // `{ O_CREAT, O_TRUNC, O_WRONLY } = fs.constants` directly.
  constants: ReturnType<typeof createConstantsModule>;
  readFileSync(path: string): Uint8Array;
  writeFileSync(path: string, contents: string | Uint8Array): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdirSync(path: string): string[];
  statSync(path: string): StatResult;
  lstatSync(path: string): StatResult;
  chmodSync(path: string, mode: number): void;
  symlinkSync(target: string, path: string): void;
  readlinkSync(path: string): string;
  realpathSync: { (path: string): string; native(path: string): string };
  rmSync(path: string, options?: { recursive?: boolean }): void;
  renameSync(from: string, to: string): void;
  existsSync(path: string): boolean;
}

interface FsBuiltin extends FsBuiltinCore {
  // File-descriptor-based I/O - traced need: fs-minipass (real tar's own
  // dependency, used to physically write/read extracted package files
  // during `npm install`) is built entirely around open/read/write/close by
  // fd, with writev() as its multi-buffer-flush fast path. See the doc
  // comment on the implementation below for how a VFS with no real OS fds
  // backs this.
  open(path: string, flags: string, mode: number, callback: NodeCallback<number>): void;
  open(path: string, flags: string, callback: NodeCallback<number>): void;
  openSync(path: string, flags: string, mode?: number): number;
  read(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null, callback: NodeCallback<number>): void;
  readSync(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null): number;
  write(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null, callback: NodeCallback<number>): void;
  writeSync(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null): number;
  writev(fd: number, buffers: Uint8Array[], position: number | null, callback: NodeCallback<number>): void;
  close(fd: number, callback: NodeCallback<void>): void;
  closeSync(fd: number): void;
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

interface FdEntry {
  path: string;
  mode: "read" | "write";
  /** "read" mode: the whole file's bytes, snapshotted once at open() - this
   * VFS has no notion of a live, seekable OS file handle to re-read from. */
  data: Uint8Array;
  /** Sequential cursor, used and advanced only when a call passes
   * position === null (real Node's own "use the current position" meaning);
   * an explicit numeric position never touches this. */
  position: number;
}

/** Grows (never shrinks) a Uint8Array in place, preserving existing bytes -
 * backs "write" mode's in-memory file image, since a write can land past
 * the current end (real Node's fs.write with an explicit position allows
 * exactly that, zero-filling the gap). */
const ensureCapacity = (data: Uint8Array, minLength: number): Uint8Array => {
  if (data.length >= minLength) return data;
  const grown = new Uint8Array(minLength);
  grown.set(data);
  return grown;
};

/** Guest `fs` builtin. Every *Sync method (plus the fd-table bookkeeping
 * fd-based methods build on) talks to the VFS through the synchronous
 * SharedArrayBuffer bridge; the plain-callback (non-Sync) fd methods are
 * genuinely real Node callback signatures - real code (fs-minipass) calls
 * them expecting a callback, not a promise - implemented by doing the same
 * synchronous VFS call and deferring the callback through `nextTick` so
 * it's still visible to the event loop's hasPendingWork() (see
 * createFsPromisesBuiltin's own doc comment for why a bare queueMicrotask/
 * setTimeout(0) here would silently drop the callback on a process that
 * has nothing else keeping it alive).
 */
const createFsBuiltin = (io: FsBuiltinIO, nextTick: (callback: () => void) => void = (cb) => cb()): FsBuiltin => {
  const call = (request: FsRequest): FsResponseOk => requireSyncChannel(io)(request);

  // Real Node's fs.realpathSync ALSO carries a `.native` property (the OS-
  // native resolver variant, distinct from its own pure-JS fallback) - real
  // code reaches for it directly (traced need: path-scurry's own
  // `fs.realpathSync.native`). One VFS-backed implementation serves both;
  // `.native` is attached separately below since an object literal method
  // can't reference its own function value to hang a property off of.
  const realpathSync = (path: string): string => {
    const response = call({ op: FsOp.REALPATH, path }) as Extract<FsResponseOk, { op: FsOp.REALPATH }>;
    return response.path;
  };
  (realpathSync as { native?: typeof realpathSync }).native = realpathSync;

  const core: FsBuiltinCore = {
    constants: createConstantsModule(),
    realpathSync: realpathSync as FsBuiltinCore["realpathSync"],
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

  const fdTable = new Map<number, FdEntry>();
  let nextFd = 10; // clear of 0/1/2 (stdio) even though this VFS never allocates those

  const requireFd = (fd: number): FdEntry => {
    const entry = fdTable.get(fd);
    if (!entry) throw Object.assign(new Error(`EBADF: bad file descriptor (fd ${fd})`), { code: "EBADF" });
    return entry;
  };

  const openSync: FsBuiltin["openSync"] = (path, flags) => {
    const wantsWrite = flags !== "r";
    // 'w' truncates. Everything else ('r', and 'r+' which preserves
    // existing content for in-place overwrites) reads the current file -
    // fs-minipass's own WriteStream specifically relies on 'r+' throwing
    // ENOENT for a not-yet-created file (it catches exactly that to retry
    // with 'w'), and core.readFileSync already throws the real
    // FSError/ENOENT for a missing path, so this just lets that propagate.
    const data = flags === "w" ? new Uint8Array(0) : core.readFileSync(path);
    const fd = nextFd++;
    fdTable.set(fd, { path, mode: wantsWrite ? "write" : "read", data, position: 0 });
    return fd;
  };

  const open: FsBuiltin["open"] = (
    path: string,
    flags: string,
    modeOrCallback: number | NodeCallback<number>,
    maybeCallback?: NodeCallback<number>,
  ) => {
    const callback = typeof modeOrCallback === "function" ? modeOrCallback : maybeCallback!;
    nextTick(() => {
      try {
        callback(null, openSync(path, flags));
      } catch (error) {
        callback(error);
      }
    });
  };

  const readSync: FsBuiltin["readSync"] = (fd, buffer, offset, length, position) => {
    const entry = requireFd(fd);
    const readAt = position ?? entry.position;
    const bytesAvailable = Math.max(0, entry.data.length - readAt);
    const bytesRead = Math.min(length, bytesAvailable);
    buffer.set(entry.data.subarray(readAt, readAt + bytesRead), offset);
    if (position === null) entry.position += bytesRead;
    return bytesRead;
  };

  const read: FsBuiltin["read"] = (fd, buffer, offset, length, position, callback) => {
    nextTick(() => {
      try {
        callback(null, readSync(fd, buffer, offset, length, position));
      } catch (error) {
        callback(error);
      }
    });
  };

  const writeSync: FsBuiltin["writeSync"] = (fd, buffer, offset, length, position) => {
    const entry = requireFd(fd);
    if (entry.mode !== "write") throw Object.assign(new Error(`EBADF: fd ${fd} was not opened for writing`), { code: "EBADF" });
    const writeAt = position ?? entry.position;
    entry.data = ensureCapacity(entry.data, writeAt + length);
    entry.data.set(buffer.subarray(offset, offset + length), writeAt);
    if (position === null) entry.position += length;
    return length;
  };

  const write: FsBuiltin["write"] = (fd, buffer, offset, length, position, callback) => {
    nextTick(() => {
      try {
        callback(null, writeSync(fd, buffer, offset, length, position));
      } catch (error) {
        callback(error);
      }
    });
  };

  const writev: FsBuiltin["writev"] = (fd, buffers, position, callback) => {
    nextTick(() => {
      try {
        let total = 0;
        let at = position;
        for (const buffer of buffers) {
          total += writeSync(fd, buffer, 0, buffer.length, at);
          if (at !== null) at += buffer.length;
        }
        callback(null, total);
      } catch (error) {
        callback(error);
      }
    });
  };

  const closeSync: FsBuiltin["closeSync"] = (fd) => {
    const entry = requireFd(fd);
    fdTable.delete(fd);
    // Persisted only now, not per-write - this VFS has no partial-write
    // concept, and every traced caller (fs-minipass) only reads the path
    // again after the fd that wrote it has been closed.
    if (entry.mode === "write") core.writeFileSync(entry.path, entry.data);
  };

  const close: FsBuiltin["close"] = (fd, callback) => {
    nextTick(() => {
      try {
        closeSync(fd);
        callback(null);
      } catch (error) {
        callback(error);
      }
    });
  };

  return { ...core, openSync, open, readSync, read, writeSync, write, writev, closeSync, close };
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
    realpath: (path: string) => toPromise(() => fs.realpathSync(path)),
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
