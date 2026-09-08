// Real node:wasi, backed by this project's existing sync fs bridge instead of
// hand-writing the WASI preview1 syscall/struct-encoding layer from scratch.
//
// Traced need: real rolldown's own WebContainer WASM fallback
// (@rolldown/binding-wasm32-wasi, see module.ts's own doc comment on
// process.versions.webcontainer) does `require('node:wasi')` to build the
// import object real WebAssembly.instantiate() needs - `WebAssembly.Module
// .imports()` on the real downloaded .wasm confirms it needs exactly 21
// wasi_snapshot_preview1 functions (fd_read/fd_write/path_open/readdir-style
// file I/O, environ_get, clock_time_get, random_get, proc_exit, poll_oneoff,
// sched_yield - no networking, no rename/symlink-heavy surface), not the full
// preview1 ABI.
//
// Rather than hand-roll that (real, fiddly memory-layout code - iovecs,
// dirent structs, filestat structs - that's very easy to get subtly wrong
// with no live wasm module to verify against line by line), this vendors
// @tybys/wasm-util's real, complete preview1 implementation (MIT licensed -
// see ../node/vendor/wasi/index.mjs's own header) and adapts ONLY its
// pluggable `options.fs` parameter (a Node-fs-shaped sync object) onto this
// project's existing FsBuiltin - the same fs.*Sync primitives fs.ts already
// exposes to guest code. That vendored code already implements real Node's
// exact WASI class shape (.wasiImport/.initialize()/.start()) and error-code
// (ENOENT/EBADF/EEXIST/...) to WASI-errno mapping.
import { WASI as VendoredWASI } from "../node/vendor/wasi/index.mjs";
import { join } from "./path";
import type { FsBuiltin } from "./fs";

interface BigIntStatsLike {
  dev: bigint;
  ino: bigint;
  mode: bigint;
  nlink: bigint;
  size: bigint;
  atimeMs: bigint;
  mtimeMs: bigint;
  ctimeMs: bigint;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isSocket(): boolean;
}

interface DirentLike {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isSocket(): boolean;
}

/** Real Node's numeric fs.constants.O_* values - this project's own
 * FsBuiltin.openSync takes Node's STRING flags ('r'/'w'/'r+'/...) instead
 * (see fs.ts's own doc comment on why), so path_open's numeric o_flags need
 * translating on the way in. Values match real Linux (and the vendored
 * preview1.mjs's own internal FileControlFlag enum, which computes exactly
 * these bits before calling fs.openSync) - not redefined against that
 * enum directly since wasi.ts has no need to import the rest of it. */
const O_WRONLY = 1;
const O_RDWR = 2;
const O_CREAT = 64;
const O_TRUNC = 512;

/** fd -> real path, for fstatSync(fd) - FsBuiltin's own client-side fd table
 * (fs.ts's FdEntry) already tracks this internally but doesn't expose it;
 * cheaper to track our own narrow copy here than to widen FsBuiltin's public
 * surface for one caller. */
const createWasiFsAdapter = (fs: FsBuiltin) => {
  const fdPaths = new Map<number, string>();

  const toBigIntStats = (isFile: boolean, isDirectory: boolean, isSymbolicLink: boolean, size: number, mode: number, mtimeMs: number): BigIntStatsLike => ({
    // No real inode/device/link-count model exists in this VFS - fixed,
    // honest stand-ins (matching the chown/utimes precedent in fs.ts: these
    // just need to exist and be self-consistent, nothing reads them back for
    // real identity comparisons the way a real filesystem's callers might).
    dev: 1n,
    ino: 0n,
    nlink: 1n,
    mode: BigInt(mode),
    size: BigInt(size),
    // This VFS has no separate access/change/modify timestamps - mtimeMs
    // (the one real timestamp fs.ts's StatResult carries) stands in for all
    // three, same spirit as the dev/ino stand-ins above.
    atimeMs: BigInt(Math.trunc(mtimeMs)),
    mtimeMs: BigInt(Math.trunc(mtimeMs)),
    ctimeMs: BigInt(Math.trunc(mtimeMs)),
    isFile: () => isFile,
    isDirectory: () => isDirectory,
    isSymbolicLink: () => isSymbolicLink,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSocket: () => false,
  });

  const statLike = (path: string, lstat: boolean): BigIntStatsLike => {
    const stat = lstat ? fs.lstatSync(path) : fs.statSync(path);
    return toBigIntStats(stat.isFile(), stat.isDirectory(), stat.isSymbolicLink(), stat.size, stat.mode, stat.mtimeMs);
  };

  /** Real Node's fs.openSync(path, flagsNumber, mode) - the vendored
   * preview1.mjs's path_open computes flagsRes from WASI's own o_flags/
   * fs_rights_base bits (see its own pathOpen() helper) and calls this
   * directly; createSync's preopen setup instead calls openSync(path, 'r',
   * mode) with a literal string, which FsBuiltin.openSync already accepts
   * unchanged.
   *
   * Directories are a separate case: FsBuiltin.openSync always snapshots a
   * path's byte CONTENTS (its fd table has no directory notion at all -
   * nothing needed one before this), which throws EISDIR for a directory
   * path. Real Node allows opening a directory fd (you just can't read()
   * bytes from it) - traced need: the vendored preview1.mjs's own
   * createSync() does exactly `fs.openSync(preopenRealPath, 'r', mode)` to
   * install each preopen, and a preopen is a directory (real rolldown's own
   * preopen is the WASI root "/"). Directory fds are minted and tracked
   * ENTIRELY in this adapter's own fdPaths map, in a numeric range FsBuiltin
   * never allocates into (real Node fds and JS array/object indices both
   * start small and count up - see fs.ts's own `nextFd = 10` - so counting
   * DOWN from -1 here can never collide with one FsBuiltin actually hands
   * out) - nothing calls readSync/writeSync on one (fd_readdir/fstat go
   * through this adapter's own path-based readdirSync/fstatSync instead), so
   * closeSync for one is just bookkeeping cleanup, not a real fs.closeSync
   * call (which would throw EBADF - FsBuiltin's own table never saw this
   * fd). */
  let nextDirectoryFd = -1;
  const directoryFds = new Set<number>();

  const openSync = (path: string, flags: number | string, _mode?: number): number => {
    if (fs.existsSync(path) && fs.statSync(path).isDirectory()) {
      const fd = nextDirectoryFd--;
      directoryFds.add(fd);
      fdPaths.set(fd, path);
      return fd;
    }

    let translated: string;
    if (typeof flags === "string") {
      translated = flags;
    } else {
      const wantsWrite = (flags & O_WRONLY) !== 0 || (flags & O_RDWR) !== 0;
      if (!wantsWrite) {
        translated = "r";
      } else {
        const truncate = (flags & O_TRUNC) !== 0;
        const creating = (flags & O_CREAT) !== 0;
        // FsBuiltin.openSync: any 'w'-prefixed flag starts from an empty
        // buffer; anything else reads the existing file first (and throws
        // ENOENT if there isn't one) - O_CREAT on a not-yet-existing path
        // needs the empty-buffer branch too, or a brand-new file's first
        // open would incorrectly throw.
        translated = truncate || (creating && !fs.existsSync(path)) ? "w" : "r+";
      }
    }
    // FsBuiltin.openSync("w", ...) only snapshots an empty in-memory buffer -
    // the real VFS isn't touched until closeSync() writes it back (fs.ts's
    // own client-side fd model). Real Node's open('w') creates/truncates the
    // file on disk immediately, and WASI's own path_open relies on exactly
    // that: it calls fstatSync() on the fd right after opening it (to learn
    // the file's type/size for the fd table entry it's building) - without
    // this, that stat sees a not-yet-existent file and path_open fails with
    // a spurious ENOENT for every single file creation, real content aside.
    if (translated === "w") fs.writeFileSync(path, new Uint8Array(0));
    const fd = fs.openSync(path, translated, _mode);
    fdPaths.set(fd, path);
    return fd;
  };

  const closeSync = (fd: number): void => {
    fdPaths.delete(fd);
    if (directoryFds.delete(fd)) return;
    fs.closeSync(fd);
  };

  const fstatSync = (fd: number): BigIntStatsLike => {
    const path = fdPaths.get(fd);
    if (!path) throw Object.assign(new Error(`EBADF: bad file descriptor (fd ${fd})`), { code: "EBADF" });
    return statLike(path, false);
  };

  const readdirSync = (path: string): DirentLike[] =>
    fs.readdirSync(path).map((name) => {
      const stat = fs.lstatSync(join(path, name));
      return {
        name,
        isFile: () => stat.isFile(),
        isDirectory: () => stat.isDirectory(),
        isSymbolicLink: () => stat.isSymbolicLink(),
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSocket: () => false,
      };
    });

  return {
    openSync,
    closeSync,
    fstatSync,
    statSync: (path: string) => statLike(path, false),
    lstatSync: (path: string) => statLike(path, true),
    readdirSync,
    readSync: (fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null) => fs.readSync(fd, buffer, offset, length, position),
    writeSync: (fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null) => fs.writeSync(fd, buffer, offset, length, position),
    mkdirSync: (path: string) => fs.mkdirSync(path),
    rmdirSync: (path: string) => fs.rmSync(path),
    unlinkSync: (path: string) => fs.rmSync(path),
    renameSync: (from: string, to: string) => fs.renameSync(from, to),
    symlinkSync: (target: string, path: string) => fs.symlinkSync(target, path),
    readlinkSync: (path: string) => fs.readlinkSync(path),
    realpathSync: (path: string) => fs.realpathSync(path),
    // No real hardlink model exists in this VFS (there's no shared-inode
    // concept to link into) - a one-time content copy is an honest,
    // traced-scope-sized approximation: right at creation time, wrong if
    // either path is written to afterward and the other is expected to see
    // it. No caller this project has traced needs true hardlink aliasing.
    linkSync: (existingPath: string, newPath: string) => fs.writeFileSync(newPath, fs.readFileSync(existingPath)),
    // No real per-field timestamp model or fsync/truncate-in-place target
    // exists in this VFS - these just need to exist and succeed (matching
    // fs.ts's own chown/utimes precedent), not actually change anything.
    utimesSync: (_path: string, _atime: number, _mtime: number) => {},
    futimesSync: (_fd: number, _atime: number, _mtime: number) => {},
    fsyncSync: (_fd: number) => {},
    fdatasyncSync: (_fd: number) => {},
    ftruncateSync: (_fd: number, _len: number) => {},
  };
};

interface WasiOptions {
  version?: string;
  args?: string[];
  env?: Record<string, string>;
  preopens?: Record<string, string>;
  returnOnExit?: boolean;
}

interface WasiInstance {
  wasiImport: Record<string, (...args: never[]) => unknown>;
  initialize(instance: WebAssembly.Instance): void;
  start(instance: WebAssembly.Instance): number;
}

/** The vendored index.mjs has no type declarations of its own (plain JS) -
 * TS's structural inference of its class body trips over its own internal
 * private-symbol-keyed fields (see the doc comment on VendoredWASI's import)
 * if extended directly via `class ... extends`, so it's treated as an opaque
 * constructor here instead and cast to the real Node `node:wasi` shape this
 * module needs to expose. */
const OpaqueWASI = VendoredWASI as unknown as new (options: WasiOptions & { fs: unknown }) => WasiInstance;

/** `wasi`/`node:wasi` builtin factory. `getFsBuiltin` is resolved lazily (at
 * `new WASI(...)` time, not at builtins-registry-construction time) since
 * worker.ts constructs the real FsBuiltin instance AFTER building the
 * vendored builtins registry this module is part of - the same deferred-cell
 * pattern module.ts's createRequire() already uses for the same ordering
 * reason. Guest code can only reach `require('wasi')` after boot() has fully
 * run, so the cell is always populated by real use. */
const createWasiModule = (getFsBuiltin: () => FsBuiltin) => ({
  WASI: function WASI(this: unknown, options: WasiOptions): WasiInstance {
    return new OpaqueWASI({ ...options, fs: createWasiFsAdapter(getFsBuiltin()) });
  } as unknown as new (options: WasiOptions) => WasiInstance,
});

export { createWasiModule };
