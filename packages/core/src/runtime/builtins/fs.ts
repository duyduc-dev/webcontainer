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
  // Real Node's fs.Stats carries both - traced need: real Vite's own
  // static-file-serving middleware builds a Last-Modified header via
  // `stat.mtime.toUTCString()`, not `mtimeMs`. Without this, `stat.mtime`
  // is undefined and that throws "Cannot read properties of undefined
  // (reading 'toUTCString')" - confirmed live via a real GET of a static
  // asset (favicon.svg) through a real vite dev server (500, though the
  // process itself survives - see PROGRESS.md item 9).
  mtime: Date;
}

// Real Node's fs.Dirent (returned by readdir(path, { withFileTypes: true }))
// - traced need: real Vite's own dev-server startup does exactly this to
// list a directory while walking the filesystem for config/dependency
// discovery, then calls `dirent.isSymbolicLink()` on each entry. Confirmed
// live: without this, every entry comes back as a bare string (readdirSync
// never looked at `withFileTypes` at all), and calling a method on a string
// throws "dirent.isSymbolicLink is not a function" - not a rare edge case,
// this crashed real `vite`'s dev server on startup before it ever got to
// serve anything.
interface DirentResult {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

const joinPath = (dir: string, name: string): string => (dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`);

type FSWatchListener = (eventType: "rename" | "change", filename: string | null) => void;

interface FSWatcher {
  close(): void;
  on(event: "change" | "error", listener: (...args: unknown[]) => void): FSWatcher;
  off(event: "change" | "error", listener: (...args: unknown[]) => void): FSWatcher;
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
  // Real Node's fs.readFileSync(path, 'utf8'|{encoding}) decodes and returns
  // a string instead of a Buffer - traced need: real npm's own
  // lib/utils/error-message.js does exactly
  // `fs.readFileSync(path, 'utf8').replace(...)`, and this exact pattern
  // (encoding argument, then a String.prototype method call on the result)
  // recurs constantly across the wider npm dependency tree, so it's worth
  // supporting both call shapes now rather than only the one traced site.
  // Also accepts a `URL` (typically `file://`) - traced need: real Vite 7's
  // own logger.js does `readFileSync(new URL("../../package.json", ...))`
  // to find its own package.json (see call()'s own doc comment on PATH_LIKE_FIELDS).
  readFileSync(path: string | URL): Uint8Array;
  readFileSync(path: string | URL, options: { encoding: string; flag?: string } | string): string;
  writeFileSync(path: string, contents: string | Uint8Array): void;
  // Real Node's fs.appendFileSync(path, data) creates the file if missing,
  // otherwise appends - traced need: real npm's own cacache appends each new
  // index entry as its own line to a shared, growing bucket file (rather
  // than rewriting the whole file per entry), via `fs/promises`'
  // `appendFile`.
  appendFileSync(path: string, contents: string | Uint8Array): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readdirSync(path: string): string[];
  readdirSync(path: string, options: { withFileTypes: true }): DirentResult[];
  statSync(path: string): StatResult;
  lstatSync(path: string): StatResult;
  chmodSync(path: string, mode: number): void;
  // Only mtime is honored (no atime model - see utimes' own doc comment
  // below for why this needs to be real, not a no-op).
  utimesSync(path: string, atime: number | string | Date, mtime: number | string | Date): void;
  symlinkSync(target: string, path: string): void;
  readlinkSync(path: string): string;
  realpathSync: { (path: string): string; native(path: string): string };
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  // Distinct real Node call from rmSync (removes an empty directory,
  // ENOTEMPTY if not - no `force`/`recursive` traced need yet, unlike
  // rmSync) - traced need: real npm's own dependency tree calls this
  // directly rather than the newer rmSync/rm.
  rmdirSync(path: string): void;
  renameSync(from: string, to: string): void;
  existsSync(path: string): boolean;
  // Traced need: real create-vite's own file-copying helper (used to lay
  // down a template's static files during scaffolding) calls this directly -
  // `fs.cpSync`-style recursive tree copying has no traced need yet, only
  // this single-file form.
  copyFileSync(src: string, dest: string): void;
}

interface FsBuiltin extends FsBuiltinCore {
  // Real Node's callback-form fs.readFile - traced need: real npm's own
  // read-cmd-shim does `promisify(fs.readFile)` then calls it as
  // `readFile(path)`, expecting a `.toString()`-able Buffer back. No traced
  // caller passes an encoding option, so (like readFileSync) this doesn't
  // accept one either - it always resolves the raw (wrapped) bytes.
  readFile(path: string, callback: NodeCallback<Uint8Array>): void;
  // Real Node's callback-form fs.stat - traced need: real npm's own
  // mkdirp dependency (bundled inside tar) checks whether its target
  // directory already exists via `fs.stat(dir, cb)` before creating it.
  stat(path: string, callback: NodeCallback<StatResult>): void;
  // The rest of this block is the callback-form fs API real tar's own
  // lib/mkdir.js and lib/unpack.js need while physically recreating a
  // package's directory tree and file metadata during extraction - traced
  // need: `npm install left-pad` reaching real tar's own directory-creation
  // retry logic (`onmkdir`'s error handler calls `fs.lstat` to tell "already
  // exists as a directory, fine" apart from a real conflict).
  lstat(path: string, callback: NodeCallback<StatResult>): void;
  // Traced need: real Vite's own dist/node/chunks/node.js does
  // `import { readdir } from 'node:fs'` at its top level - the callback-form
  // counterpart to readdirSync above, same as readFile/stat/lstat already
  // are for their own *Sync forms.
  readdir(path: string, callback: NodeCallback<string[]>): void;
  readdir(path: string, options: { withFileTypes: true }, callback: NodeCallback<DirentResult[]>): void;
  // Same top-level import, same pattern, for realpathSync's own callback
  // counterpart - real Vite's own package-resolution code calls this to
  // follow a symlinked dependency (e.g. a pnpm/workspace-linked package) to
  // its real on-disk path.
  realpath(path: string, callback: NodeCallback<string>): void;
  mkdir(path: string, mode: number, callback: NodeCallback<void>): void;
  mkdir(path: string, callback: NodeCallback<void>): void;
  chmod(path: string, mode: number, callback: NodeCallback<void>): void;
  unlink(path: string, callback: NodeCallback<void>): void;
  rmdir(path: string, callback: NodeCallback<void>): void;
  rename(from: string, to: string, callback: NodeCallback<void>): void;
  // No real multi-user ownership model exists in this VFS (there's nothing
  // to chown to) - traced need: real tar's own Unpack calls these
  // unconditionally while restoring an extracted entry's metadata, so they
  // need to exist and succeed, not actually change anything.
  chown(path: string, uid: number, gid: number, callback: NodeCallback<void>): void;
  fchown(fd: number, uid: number, gid: number, callback: NodeCallback<void>): void;
  // Unlike chown/fchown above, this DOES need to actually change the file's
  // mtime - traced need: `proper-lockfile` (used by real npm's own
  // cacache/@npmcli/fs for concurrent-safe writes) periodically bumps a
  // lock file's mtime via fs.utimes() to prove it's still held, then
  // re-stats to confirm the bump took effect; a no-op utimes() makes that
  // verification always fail, which proper-lockfile treats as "lock
  // compromised" (ECOMPROMISED) and aborts the write - this is what broke a
  // real `npm create vite` mid-extraction. Only mtime is honored (atime
  // isn't tracked at all - see VirtualFileSystem's Stat shape).
  utimes(path: string, atime: number | string | Date, mtime: number | string | Date, callback: NodeCallback<void>): void;
  futimes(fd: number, atime: number | string | Date, mtime: number | string | Date, callback: NodeCallback<void>): void;
  // File-descriptor-based I/O - traced need: fs-minipass (real tar's own
  // dependency, used to physically write/read extracted package files
  // during `npm install`) is built entirely around open/read/write/close by
  // fd, with writev() as its multi-buffer-flush fast path. See the doc
  // comment on the implementation below for how a VFS with no real OS fds
  // backs this.
  open(path: string, flags: string, mode: number, callback: NodeCallback<number>): void;
  open(path: string, flags: string, callback: NodeCallback<number>): void;
  openSync(path: string, flags: string, mode?: number): number;
  read(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
    // Real Node's fs.read callback is (err, bytesRead, buffer) - THREE
    // arguments, not NodeCallback<number>'s two. fs-minipass's ReadStream
    // (real tar's own dependency) destructures all three positionally
    // (`[_onread] (er, br, buf)`) and does `buf.length` unconditionally in
    // `_handleChunk` - a callback that drops the third argument hands it
    // undefined there, crashing with "Cannot read properties of undefined
    // (reading 'length')" deep inside vendored, unmodified npm code.
    callback: (error: unknown, bytesRead?: number, buffer?: Uint8Array) => void,
  ): void;
  readSync(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null): number;
  write(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null, callback: NodeCallback<number>): void;
  writeSync(fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null): number;
  writev(fd: number, buffers: Uint8Array[], position: number | null, callback: NodeCallback<number>): void;
  close(fd: number, callback: NodeCallback<void>): void;
  closeSync(fd: number): void;
  // Real Node's fs.watch(path[, options][, listener]) - traced need: real
  // Vite's own dependency-optimizer/config watcher (chokidar's fallback
  // createFsWatchInstance) calls this directly at dev-server *startup*, not
  // only for live-reload - crashed immediately without it existing at all.
  // Real change notifications: the synchronous SharedArrayBuffer bridge
  // (syncWireFormat.ts) has no push channel of its own (it's strictly
  // request/response), so this is backed by a SEPARATE async relay - see
  // the injected `watchBridge` parameter on createFsBuiltin below, and
  // workers/fs/worker.ts's own watch registry (the single, process-
  // agnostic point that actually detects a mutation, since the VFS backing
  // every process's fs calls, sync and async alike, is that one shared FS
  // Worker instance).
  watch(path: string, listener?: FSWatchListener): FSWatcher;
  watch(path: string, options: { persistent?: boolean; recursive?: boolean } | string, listener?: FSWatchListener): FSWatcher;
  // Real Node's fs.createReadStream(path[, options]) - traced need: real
  // Vite's own static-file-serving middleware (sirv, used for `/public`
  // assets - the img/logo files a real scaffolded template ships) does
  // `fs.createReadStream(file, opts).pipe(res)`, `opts` optionally carrying
  // `{start, end}` for an HTTP Range request. This VFS has no real
  // incremental-disk-read primitive to back genuine chunked streaming (see
  // fs.watch's own doc comment on the same limitation) - it reads the
  // whole (possibly range-sliced) file eagerly via readFileSync and hands
  // it to the injected `createReadableFromBytes` factory as one chunk, a
  // real `stream.Readable` from the caller's own `require('stream')` (fs.ts
  // itself has no `require()` to reach that module directly - same
  // externally-injected-factory pattern `wrapBuffer` already uses for
  // `Buffer`). `end` is INCLUSIVE, matching real Node's own contract (byte
  // `end` IS part of the returned range).
  createReadStream(path: string, options?: { start?: number; end?: number }): unknown;
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

/** Real Node's fs.utimes()/utimesSync() have a genuinely surprising rule
 * (unlike every other timestamp API in Node): a plain number - or a numeric
 * string - is Unix epoch time in SECONDS, not milliseconds, matching POSIX
 * utime()'s own units; only a Date uses real getTime() milliseconds. */
const toMtimeMs = (value: number | string | Date): number => {
  if (value instanceof Date) return value.getTime();
  const seconds = typeof value === "string" ? parseFloat(value) : value;
  return seconds * 1000;
};

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
const createFsBuiltin = (
  io: FsBuiltinIO,
  nextTick: (callback: () => void) => void = (cb) => cb(),
  // Real Node's callback-form fs.readFile hands back an actual Buffer, whose
  // `.toString()` UTF-8-decodes (unlike a bare Uint8Array's, which prints
  // comma-separated byte values) - traced need: real npm's own read-cmd-shim
  // calls `.toString()` on what it gets back. Defaults to identity so
  // existing/test call sites that don't care about Buffer-ness keep working
  // unchanged; worker.ts wires this to the real vendored `Buffer.from`.
  wrapBuffer: (bytes: Uint8Array) => Uint8Array = (bytes) => bytes,
  // Backs createReadStream() - fs.ts has no require() of its own to reach
  // the real `stream` module's Readable class (same reason wrapBuffer is
  // injected rather than importing Buffer directly), so a caller that
  // wants real `.pipe()`/`.on()` semantics (worker.ts, wired to the real
  // vendored `Readable`) passes a factory in. Defaults to a chainable
  // no-op stand-in (ignores `bytes` entirely) so existing/test call sites
  // that don't exercise piping keep working unchanged.
  createReadableFromBytes: (bytes: Uint8Array) => unknown = () => {
    const stub = { pipe: (dest: unknown) => dest, on: () => stub };
    return stub;
  },
  // Backs watch() with a real, live change feed - fs.ts has no channel of
  // its own to the kernel/FS Worker (same reason wrapBuffer/
  // createReadableFromBytes are injected rather than reached for directly),
  // so a caller that wants real notifications (worker.ts, wired to
  // createFsWatchBridge) passes this in. Defaults to a stand-in that
  // returns a real-shaped, working handle which simply never fires -
  // matching every other "exists and is callable, doesn't fake the part
  // that needs real infrastructure" default in this file (createReadStream,
  // wrapBuffer) - so a caller that doesn't care about live notifications
  // (e.g. this file's own tests) keeps working unchanged.
  watchBridge: {
    watch(path: string, recursive: boolean, onEvent: (eventType: "change" | "rename", filename: string | null) => void): { close(): void };
  } = { watch: () => ({ close() {} }) },
): FsBuiltin => {
  // Real Node's fs functions accept a `URL` (typically `file://`, from an
  // `import.meta.url`-relative read) anywhere they accept a path string -
  // traced need: real Vite 7's own dist/node/chunks/logger.js does
  // `readFileSync(new URL("../../package.json", new URL(...)))` to find its
  // own package.json. Left as-is, a URL object reaching the wire format's
  // own `writeString` gets silently coerced via its OWN `.toString()` (the
  // full "file:///..." string), which every op here would then treat as a
  // literal, bogus (doesn't start with "/") VFS path. `.pathname` is the
  // real absolute path a `file:` URL encodes - decoded once for any percent-
  // escaped characters, matching what real Node's own `fileURLToPath` does
  // for this VFS's POSIX-only paths. Every current op's own path-shaped
  // field is covered generically here rather than in each function
  // individually, so a future op needs no special-casing to inherit this.
  const PATH_LIKE_FIELDS = ["path", "from", "to", "target"] as const;
  const call = (request: FsRequest): FsResponseOk => {
    for (const field of PATH_LIKE_FIELDS) {
      const value = (request as Record<string, unknown>)[field];
      if (value instanceof URL) (request as Record<string, unknown>)[field] = decodeURIComponent(value.pathname);
    }
    return requireSyncChannel(io)(request);
  };

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

  function readFileSync(path: string | URL): Uint8Array;
  function readFileSync(path: string | URL, options: { encoding: string; flag?: string } | string): string;
  function readFileSync(path: string | URL, options?: { encoding: string; flag?: string } | string): Uint8Array | string {
    // call() converts a URL to a real VFS path before this ever reaches the
    // wire format - the cast just reflects that runtime guarantee to TS.
    const response = call({ op: FsOp.READ_FILE, path: path as string }) as Extract<FsResponseOk, { op: FsOp.READ_FILE }>;
    const encoding = typeof options === "string" ? options : options?.encoding;
    // Real Node's fs.readFileSync(path) with NO encoding still returns a
    // Buffer, not a bare Uint8Array - traced need: real npm's own cacache
    // reads cached content back this way, then calls `.toString()` on it
    // elsewhere expecting UTF-8 decoding, which only a real Buffer's
    // toString() does (a bare Uint8Array's prints comma-separated byte
    // values instead).
    if (!encoding) return wrapBuffer(response.contents);
    // "utf8" covers the overwhelming majority of real readFileSync(path,
    // encoding) call sites (reading package.json/JS source/text) and
    // decodes correctly via the platform TextDecoder regardless of whether
    // a real Buffer is wired in (wrapBuffer defaults to identity for
    // callers, e.g. this file's own tests, that don't need one) - anything
    // else (base64, hex, latin1, ...) goes through wrapBuffer's real
    // Buffer.prototype.toString(encoding), which requires one.
    if (encoding === "utf8" || encoding === "utf-8") return new TextDecoder().decode(response.contents);
    return (wrapBuffer(response.contents) as unknown as { toString(encoding: string): string }).toString(encoding);
  }

  function readdirSync(path: string): string[];
  function readdirSync(path: string, options: { withFileTypes: true }): DirentResult[];
  function readdirSync(path: string, options?: { withFileTypes?: boolean }): string[] | DirentResult[] {
    const response = call({ op: FsOp.READDIR, path }) as Extract<FsResponseOk, { op: FsOp.READDIR }>;
    if (!options?.withFileTypes) return response.entries;
    // Same type-check semantics as lstat (not stat) - a symlink entry
    // reports isSymbolicLink() true regardless of what it points to,
    // matching real Node's own readdir(withFileTypes) behavior.
    return response.entries.map((name) => {
      const entryStat = core.lstatSync(joinPath(path, name));
      return {
        name,
        isFile: () => entryStat.isFile(),
        isDirectory: () => entryStat.isDirectory(),
        isSymbolicLink: () => entryStat.isSymbolicLink(),
      };
    });
  }

  const core: FsBuiltinCore = {
    constants: createConstantsModule(),
    realpathSync: realpathSync as FsBuiltinCore["realpathSync"],
    readFileSync,
    writeFileSync(path, contents) {
      const bytes = typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
      call({ op: FsOp.WRITE_FILE, path, contents: bytes });
    },
    appendFileSync(path, contents) {
      const bytes = typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
      const existing = core.existsSync(path) ? core.readFileSync(path) : new Uint8Array(0);
      const combined = new Uint8Array(existing.length + bytes.length);
      combined.set(existing);
      combined.set(bytes, existing.length);
      core.writeFileSync(path, combined);
    },
    mkdirSync(path, options = {}) {
      call({ op: FsOp.MKDIR, path, recursive: options.recursive ?? false });
    },
    readdirSync: readdirSync as FsBuiltinCore["readdirSync"],
    statSync(path) {
      const response = call({ op: FsOp.STAT, path }) as Extract<FsResponseOk, { op: FsOp.STAT | FsOp.LSTAT }>;
      return {
        isFile: () => response.isFile,
        isDirectory: () => response.isDirectory,
        isSymbolicLink: () => response.isSymbolicLink,
        size: response.size,
        mode: response.mode,
        mtimeMs: response.mtimeMs,
        mtime: new Date(response.mtimeMs),
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
        mtime: new Date(response.mtimeMs),
      };
    },
    chmodSync(path, mode) {
      call({ op: FsOp.CHMOD, path, mode });
    },
    utimesSync(path, _atime, mtime) {
      call({ op: FsOp.UTIMES, path, mtimeMs: toMtimeMs(mtime) });
    },
    symlinkSync(target, path) {
      call({ op: FsOp.SYMLINK, target, path });
    },
    readlinkSync(path) {
      const response = call({ op: FsOp.READLINK, path }) as Extract<FsResponseOk, { op: FsOp.READLINK }>;
      return response.target;
    },
    // Real Node's fs.rmSync(path, { force: true }) swallows ENOENT instead
    // of throwing - traced need: real npm's own cacache always removes its
    // write-in-progress tmp file this way in a `finally` block, specifically
    // so that cleanup never masks whatever error (if any) actually failed
    // the write. Without honoring `force` here, a cleanup call for a tmp
    // file that (for any reason) was never created would itself throw
    // ENOENT from inside that `finally`, which JS lets REPLACE the original
    // in-flight rejection - silently swapping a meaningful upstream error
    // for a misleading "file not found."
    rmSync(path, options = {}) {
      try {
        call({ op: FsOp.RM, path, recursive: options.recursive ?? false });
      } catch (error) {
        if (options.force && (error as { code?: string }).code === "ENOENT") return;
        throw error;
      }
    },
    rmdirSync(path) {
      call({ op: FsOp.RM, path, recursive: false });
    },
    renameSync(from, to) {
      call({ op: FsOp.RENAME, from, to });
    },
    existsSync(path) {
      const response = call({ op: FsOp.EXISTS, path }) as Extract<FsResponseOk, { op: FsOp.EXISTS }>;
      return response.exists;
    },
    copyFileSync(src, dest) {
      core.writeFileSync(dest, core.readFileSync(src));
    },
  };

  const readFile: FsBuiltin["readFile"] = (path, callback) => {
    nextTick(() => {
      try {
        // core.readFileSync(path) (no encoding) already wraps via
        // wrapBuffer - don't wrap a second time here.
        callback(null, core.readFileSync(path));
      } catch (error) {
        callback(error);
      }
    });
  };

  const stat: FsBuiltin["stat"] = (path, callback) => {
    nextTick(() => {
      try {
        callback(null, core.statSync(path));
      } catch (error) {
        callback(error);
      }
    });
  };

  const lstat: FsBuiltin["lstat"] = (path, callback) => {
    nextTick(() => {
      try {
        callback(null, core.lstatSync(path));
      } catch (error) {
        callback(error);
      }
    });
  };

  const readdir = ((path: string, optionsOrCallback: unknown, maybeCallback?: NodeCallback<unknown>) => {
    const hasOptions = typeof optionsOrCallback !== "function";
    const options = hasOptions ? (optionsOrCallback as { withFileTypes?: boolean }) : undefined;
    const callback = (hasOptions ? maybeCallback! : (optionsOrCallback as NodeCallback<unknown>));
    nextTick(() => {
      try {
        callback(null, options?.withFileTypes ? core.readdirSync(path, options as { withFileTypes: true }) : core.readdirSync(path));
      } catch (error) {
        callback(error);
      }
    });
  }) as FsBuiltin["readdir"];

  const realpath: FsBuiltin["realpath"] = (path, callback) => {
    nextTick(() => {
      try {
        callback(null, core.realpathSync(path));
      } catch (error) {
        callback(error);
      }
    });
  };

  const mkdir: FsBuiltin["mkdir"] = (
    path: string,
    modeOrCallback: number | NodeCallback<void>,
    maybeCallback?: NodeCallback<void>,
  ) => {
    const callback = typeof modeOrCallback === "function" ? modeOrCallback : maybeCallback!;
    nextTick(() => {
      try {
        core.mkdirSync(path);
        callback(null);
      } catch (error) {
        callback(error);
      }
    });
  };

  const chmod: FsBuiltin["chmod"] = (path, mode, callback) => {
    nextTick(() => {
      try {
        core.chmodSync(path, mode);
        callback(null);
      } catch (error) {
        callback(error);
      }
    });
  };

  // unlink (remove a file) and rmdir (remove an empty directory) are
  // distinct real Node calls, but this VFS's own single `rm` operation
  // already handles both cases uniformly - no separate VFS op needed for
  // either.
  const unlink: FsBuiltin["unlink"] = (path, callback) => {
    nextTick(() => {
      try {
        core.rmSync(path);
        callback(null);
      } catch (error) {
        callback(error);
      }
    });
  };

  const rmdir: FsBuiltin["rmdir"] = (path, callback) => {
    nextTick(() => {
      try {
        core.rmSync(path);
        callback(null);
      } catch (error) {
        callback(error);
      }
    });
  };

  const rename: FsBuiltin["rename"] = (from, to, callback) => {
    nextTick(() => {
      try {
        core.renameSync(from, to);
        callback(null);
      } catch (error) {
        callback(error);
      }
    });
  };

  // No real multi-user ownership or mtime-preservation model exists here -
  // these just need to exist and succeed (see the FsBuiltin interface's own
  // doc comment on this group).
  const chown: FsBuiltin["chown"] = (_path, _uid, _gid, callback) => {
    nextTick(() => callback(null));
  };

  const fchown: FsBuiltin["fchown"] = (_fd, _uid, _gid, callback) => {
    nextTick(() => callback(null));
  };

  const utimes: FsBuiltin["utimes"] = (path, atime, mtime, callback) => {
    nextTick(() => {
      try {
        core.utimesSync(path, atime, mtime);
        callback(null);
      } catch (error) {
        callback(error);
      }
    });
  };

  const futimes: FsBuiltin["futimes"] = (fd, atime, mtime, callback) => {
    nextTick(() => {
      try {
        core.utimesSync(requireFd(fd).path, atime, mtime);
        callback(null);
      } catch (error) {
        callback(error);
      }
    });
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
    // The entire "w" family (w, wx, w+, wx+) creates/truncates - this VFS
    // has no concurrent writers to race, so 'x' (O_EXCL, "fail if it
    // already exists") isn't distinguished from plain 'w'. Everything else
    // ('r', and 'r+' which preserves existing content for in-place
    // overwrites) reads the current file - fs-minipass's own WriteStream
    // specifically relies on 'r+' throwing ENOENT for a not-yet-created
    // file (it catches exactly that to retry with 'w'), and
    // core.readFileSync already throws the real FSError/ENOENT for a
    // missing path, so this just lets that propagate. Traced need: real
    // npm's own cacache opens its tmp files with the exact flag `'wx'`
    // (`new fsm.WriteStream(tmpTarget, { flags: 'wx' })`), which this used
    // to misroute into the read-existing branch, throwing ENOENT on every
    // brand-new tmp file instead of creating one.
    const data = flags.startsWith("w") ? new Uint8Array(0) : core.readFileSync(path);
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
        callback(null, readSync(fd, buffer, offset, length, position), buffer);
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

  const watch: FsBuiltin["watch"] = (
    path: string,
    optionsOrListener?: unknown,
    maybeListener?: FSWatchListener,
  ): FSWatcher => {
    const listener = typeof optionsOrListener === "function" ? (optionsOrListener as FSWatchListener) : maybeListener;
    const recursive =
      typeof optionsOrListener === "object" && optionsOrListener !== null
        ? !!(optionsOrListener as { recursive?: boolean }).recursive
        : false;

    const changeListeners = new Set<(...args: unknown[]) => void>();
    if (listener) changeListeners.add(listener as (...args: unknown[]) => void);

    // The real, live notification feed - see watchBridge's own doc comment
    // on createFsBuiltin for what backs this in worker.ts, and its default
    // (a handle that never fires) for what backs it everywhere else (tests,
    // worker_threads' own minimal guest environment).
    const bridgeHandle = watchBridge.watch(path, recursive, (eventType, filename) => {
      for (const fn of changeListeners) fn(eventType, filename);
    });

    const watcher: FSWatcher = {
      close() {
        changeListeners.clear();
        bridgeHandle.close();
      },
      on(event, fn) {
        if (event === "change") changeListeners.add(fn);
        return watcher;
      },
      off(event, fn) {
        if (event === "change") changeListeners.delete(fn);
        return watcher;
      },
    };
    return watcher;
  };

  // See FsBuiltin's own doc comment on createReadStream for the traced
  // need and this VFS's "read the whole thing eagerly, hand it to the
  // injected Readable factory as one chunk" scope. `end` is INCLUSIVE
  // (real Node's own contract) - Uint8Array.prototype.slice's own end
  // argument is exclusive, hence the `+ 1`.
  const createReadStream: FsBuiltin["createReadStream"] = (path, options = {}) => {
    const bytes = core.readFileSync(path);
    const { start, end } = options;
    const sliced = start !== undefined || end !== undefined ? bytes.slice(start ?? 0, end !== undefined ? end + 1 : undefined) : bytes;
    return createReadableFromBytes(sliced);
  };

  return {
    ...core,
    readFile,
    stat,
    lstat,
    readdir,
    realpath,
    mkdir,
    chmod,
    unlink,
    rmdir,
    rename,
    chown,
    fchown,
    utimes,
    futimes,
    openSync,
    open,
    readSync,
    read,
    writeSync,
    write,
    writev,
    closeSync,
    close,
    watch,
    createReadStream,
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

  // Real Node's fs.promises.readFile(path, 'utf8') is at least as common as
  // the Sync form - forwarded straight through to readFileSync's own
  // encoding support rather than duplicating it. Declared with overloads
  // (rather than a single union-returning arrow) so a no-options call site
  // keeps its precise `Promise<Uint8Array>` type instead of widening to
  // `Promise<Uint8Array | string>`.
  function readFile(path: string): Promise<Uint8Array>;
  function readFile(path: string, options: { encoding: string; flag?: string } | string): Promise<string>;
  function readFile(path: string, options?: { encoding: string; flag?: string } | string): Promise<Uint8Array | string> {
    return toPromise(() => (options ? fs.readFileSync(path, options) : fs.readFileSync(path)));
  }

  // Real Node's fs.promises.open() FileHandle - traced need: bin-links'
  // fix-bin.js does `const { open } = require('fs/promises')` then
  // `open(file, 'r').then(fh => fh.read(buf, 0, 2048, 0)...fh.close())` to
  // sniff a freshly-linked bin script for a Windows-style hashbang line.
  // Only the handful of FileHandle methods real npm's own dependency tree
  // actually calls are implemented - not the full fs.promises.FileHandle
  // surface.
  const open = (path: string, flags: string, mode?: number) =>
    toPromise(() => {
      const fd = fs.openSync(path, flags, mode);
      return {
        fd,
        read: (buffer: Uint8Array, offset: number, length: number, position: number | null) =>
          toPromise(() => ({ bytesRead: fs.readSync(fd, buffer, offset, length, position), buffer })),
        write: (buffer: Uint8Array, offset: number, length: number, position: number | null) =>
          toPromise(() => ({ bytesWritten: fs.writeSync(fd, buffer, offset, length, position), buffer })),
        close: () => toPromise(() => fs.closeSync(fd)),
      };
    });

  return {
    // Real fs.promises.constants is the exact same object as fs.constants
    // (a plain passthrough, not a promise-wrapped async method) - traced
    // need: real Vite's own dist/node/chunks/node.js does
    // `import { constants, ... } from 'node:fs/promises'` at its top level.
    constants: fs.constants,
    readFile,
    open,
    writeFile: (path: string, contents: string | Uint8Array) => toPromise(() => fs.writeFileSync(path, contents)),
    appendFile: (path: string, contents: string | Uint8Array) => toPromise(() => fs.appendFileSync(path, contents)),
    mkdir: (path: string, options?: { recursive?: boolean }) => toPromise(() => fs.mkdirSync(path, options)),
    readdir: (path: string, options?: { withFileTypes?: boolean }) =>
      toPromise(() => (options?.withFileTypes ? fs.readdirSync(path, options as { withFileTypes: true }) : fs.readdirSync(path))),
    stat: (path: string) => toPromise(() => fs.statSync(path)),
    lstat: (path: string) => toPromise(() => fs.lstatSync(path)),
    chmod: (path: string, mode: number) => toPromise(() => fs.chmodSync(path, mode)),
    // Traced need: real npm's own lock implementation (libnpmexec's
    // with-lock.js, the actual "cacache/proper-lockfile"-shaped algorithm
    // behind `npm exec`/`npm create`) does `require('node:fs/promises')`
    // and periodically `await fs.utimes(lockPath, mtime, mtime)` to prove
    // its lock is still held - with no promise-form utimes at all (only the
    // callback form existed until this), that threw `TypeError: fs.utimes
    // is not a function`, silently aborted via an AbortSignal, and left
    // whatever package was being fetched (e.g. create-vite) with an empty
    // node_modules entry - the actual root cause of a real `npm create
    // vite` failing with "command not found" further downstream.
    utimes: (path: string, atime: number | string | Date, mtime: number | string | Date) =>
      toPromise(() => fs.utimesSync(path, atime, mtime)),
    symlink: (target: string, path: string) => toPromise(() => fs.symlinkSync(target, path)),
    readlink: (path: string) => toPromise(() => fs.readlinkSync(path)),
    realpath: (path: string) => toPromise(() => fs.realpathSync(path)),
    rm: (path: string, options?: { recursive?: boolean; force?: boolean }) => toPromise(() => fs.rmSync(path, options)),
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
