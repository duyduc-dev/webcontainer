import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createVirtualFileSystem } from "../../kernel/fs/VirtualFileSystem";
import { createSyncFsServerState, executeFsRequest } from "../../kernel/fs/syncServer";
import { createFsBuiltin, createFsPromisesBuiltin } from "./fs";
import type { FsBuiltinIO } from "./fs";

const makeIO = (): FsBuiltinIO => {
  const vfs = createVirtualFileSystem();
  const state = createSyncFsServerState();
  return { callSync: (request) => executeFsRequest(vfs, state, request) };
};

// Exercises createReadStream() against a REAL node:stream Readable, the
// same class worker.ts wires in for real - see fs.ts's own doc comment on
// why this is an injected factory (fs.ts has no require() of its own).
const makeReadableFromBytes = () => (bytes: Uint8Array) => {
  let sent = false;
  return new Readable({
    read() {
      if (sent) return;
      sent = true;
      this.push(Buffer.from(bytes));
      this.push(null);
    },
  });
};

const collectReadable = (stream: Readable): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

describe("createFsBuiltin", () => {
  it("writes and reads a file back synchronously", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/a.txt", "hi");
    expect(new TextDecoder().decode(fs.readFileSync("/a.txt"))).toBe("hi");
  });

  it("appendFileSync creates the file if missing, and appends on subsequent calls (real npm's own cacache appends each new index entry as a line via fs/promises.appendFile)", () => {
    const fs = createFsBuiltin(makeIO());
    fs.appendFileSync("/index.txt", "first\n");
    expect(new TextDecoder().decode(fs.readFileSync("/index.txt"))).toBe("first\n");

    fs.appendFileSync("/index.txt", "second\n");
    expect(new TextDecoder().decode(fs.readFileSync("/index.txt"))).toBe("first\nsecond\n");
  });

  it("mkdirSync + readdirSync", () => {
    const fs = createFsBuiltin(makeIO());
    fs.mkdirSync("/src", { recursive: true });
    fs.writeFileSync("/src/a.js", "a");
    expect(fs.readdirSync("/src")).toEqual(["a.js"]);
  });

  // Traced need: real Vite's own dev-server startup calls readdir(path, {
  // withFileTypes: true }) while walking the filesystem, then calls
  // dirent.isSymbolicLink() on each entry - readdirSync previously ignored
  // the options argument entirely and always returned bare strings, so this
  // crashed with "dirent.isSymbolicLink is not a function" (confirmed live,
  // real vite dev server never got past startup).
  it("readdirSync(path, { withFileTypes: true }) returns Dirent-like entries", () => {
    const fs = createFsBuiltin(makeIO());
    fs.mkdirSync("/src/nested", { recursive: true });
    fs.writeFileSync("/src/a.js", "a");
    fs.symlinkSync("/src/a.js", "/src/link.js");

    const entries = fs.readdirSync("/src", { withFileTypes: true });
    const byName = Object.fromEntries(entries.map((e) => [e.name, e]));

    expect(Object.keys(byName).sort()).toEqual(["a.js", "link.js", "nested"]);
    expect(byName["a.js"].isFile()).toBe(true);
    expect(byName["a.js"].isDirectory()).toBe(false);
    expect(byName["a.js"].isSymbolicLink()).toBe(false);
    expect(byName["nested"].isDirectory()).toBe(true);
    expect(byName["link.js"].isSymbolicLink()).toBe(true);
  });

  it("statSync reports file kind and size", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/a.txt", "hello");
    const stat = fs.statSync("/a.txt");
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBe(5);
  });

  // Real Vite's own static-file-serving middleware builds a Last-Modified
  // header via `stat.mtime.toUTCString()` - a bare `mtimeMs` number isn't
  // enough (see fs.ts's own doc comment on StatResult.mtime). Confirmed
  // live: a real GET of a static asset through a real vite dev server 500'd
  // with "Cannot read properties of undefined (reading 'toUTCString')"
  // before this field existed.
  it("statSync/lstatSync's mtime is a real Date, not just mtimeMs", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/a.txt", "hello");
    fs.symlinkSync("/a.txt", "/link.txt");

    for (const stat of [fs.statSync("/a.txt"), fs.lstatSync("/link.txt")]) {
      expect(stat.mtime).toBeInstanceOf(Date);
      expect(stat.mtime.getTime()).toBe(stat.mtimeMs);
      expect(() => stat.mtime.toUTCString()).not.toThrow();
    }
  });

  // Real Vite 7's own dist/node/chunks/logger.js finds its own package.json
  // via `readFileSync(new URL("../../package.json", new URL("../../../src/
  // node/constants.ts", import.meta.url)))` - a real URL OBJECT, not a
  // string. Left unconverted, a URL stringifies to the full "file:///..."
  // URL wherever this reaches the wire format, which every VFS op then
  // treats as a literal (and bogus) path. Confirmed live: this crashed real
  // Vite 7 on startup with `ENOENT: /file:/my-app/node_modules/vite/
  // package.json` before call() converted it (see its own doc comment).
  it("readFileSync accepts a real URL object (not just a string), converting it via its .pathname", () => {
    const fs = createFsBuiltin(makeIO());
    fs.mkdirSync("/a/b", { recursive: true });
    fs.writeFileSync("/a/b/package.json", '{"version":"1.2.3"}');
    const url = new URL("./package.json", "file:///a/b/index.js");
    expect(new TextDecoder().decode(fs.readFileSync(url))).toBe('{"version":"1.2.3"}');
  });

  // Real Vite's own static-file-serving middleware (sirv, used for a real
  // scaffolded template's `/public` image/logo assets) does
  // `fs.createReadStream(file, opts).pipe(res)` - traced need, see fs.ts's
  // own doc comment on createReadStream. Confirmed live: a real GET of an
  // image asset through a real vite dev server 500'd before this existed.
  it("createReadStream() reads the whole file and pipes it through a real Readable", async () => {
    const fs = createFsBuiltin(makeIO(), undefined, undefined, makeReadableFromBytes());
    fs.writeFileSync("/logo.svg", "<svg>hello</svg>");

    const stream = fs.createReadStream("/logo.svg") as Readable;
    const result = await collectReadable(stream);

    expect(result.toString()).toBe("<svg>hello</svg>");
  });

  it("createReadStream() honors {start, end} for an HTTP Range request - end is INCLUSIVE, matching real Node", async () => {
    const fs = createFsBuiltin(makeIO(), undefined, undefined, makeReadableFromBytes());
    fs.writeFileSync("/a.txt", "hello world");

    const stream = fs.createReadStream("/a.txt", { start: 6, end: 10 }) as Readable;
    const result = await collectReadable(stream);

    expect(result.toString()).toBe("world");
  });

  it("existsSync, rmSync, renameSync", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/a.txt", "x");
    expect(fs.existsSync("/a.txt")).toBe(true);

    fs.renameSync("/a.txt", "/b.txt");
    expect(fs.existsSync("/a.txt")).toBe(false);
    expect(fs.existsSync("/b.txt")).toBe(true);

    fs.rmSync("/b.txt");
    expect(fs.existsSync("/b.txt")).toBe(false);
  });

  it("rmSync on a missing path throws ENOENT by default, but is a no-op with { force: true }", () => {
    const fs = createFsBuiltin(makeIO());
    expect(() => fs.rmSync("/missing")).toThrow(expect.objectContaining({ code: "ENOENT" }));
    expect(() => fs.rmSync("/missing", { force: true })).not.toThrow();
  });

  it("rmSync({ force: true }) still throws a non-ENOENT error (real npm's own cacache relies on force only swallowing 'already gone', not masking a real failure)", () => {
    const fs = createFsBuiltin({});
    expect(() => fs.rmSync("/a.txt", { force: true })).toThrow(expect.objectContaining({ code: "ERR_NOT_ISOLATED" }));
  });

  it("readFileSync with an 'utf8' encoding argument returns a decoded string, not bytes (real npm's own lib/utils/error-message.js does `readFileSync(path, 'utf8').replace(...)`)", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/a.txt", "hi\r\nthere");
    const text = fs.readFileSync("/a.txt", "utf8");
    expect(text.replace(/\r\n/g, "\n")).toBe("hi\nthere");
  });

  it("readFileSync also accepts the encoding as an { encoding } options object", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/a.txt", "hi");
    expect(fs.readFileSync("/a.txt", { encoding: "utf8" })).toBe("hi");
  });

  it("readFileSync with NO encoding still wraps through the provided wrapBuffer (real npm's own cacache reads cached content this way, then calls .toString() on it expecting UTF-8 decoding - a bare Uint8Array's toString() would print comma-separated byte values instead)", () => {
    class FakeBuffer extends Uint8Array {
      toString() {
        return `wrapped:${new TextDecoder().decode(this)}`;
      }
    }
    const fs = createFsBuiltin(
      makeIO(),
      (cb) => cb(),
      (bytes) => new FakeBuffer(bytes),
    );
    fs.writeFileSync("/a.txt", "hi");
    expect(fs.readFileSync("/a.txt").toString()).toBe("wrapped:hi");
  });

  it("surfaces an FSError with the original code for a missing file", () => {
    const fs = createFsBuiltin(makeIO());
    expect(() => fs.readFileSync("/missing")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("throws DWCError(ERR_NOT_ISOLATED) when no sync channel is available", () => {
    const fs = createFsBuiltin({});
    expect(() => fs.readFileSync("/a.txt")).toThrow(expect.objectContaining({ code: "ERR_NOT_ISOLATED" }));
  });

  it("symlinkSync + readFileSync follows the link; readlinkSync reads the raw target", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/real.txt", "hi");
    fs.symlinkSync("/real.txt", "/link.txt");

    expect(new TextDecoder().decode(fs.readFileSync("/link.txt"))).toBe("hi");
    expect(fs.readlinkSync("/link.txt")).toBe("/real.txt");
  });

  it("lstatSync reports a symlink as a link; statSync reports what it points to", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/real.txt", "hi");
    fs.symlinkSync("/real.txt", "/link.txt");

    expect(fs.lstatSync("/link.txt").isSymbolicLink()).toBe(true);
    expect(fs.statSync("/link.txt").isSymbolicLink()).toBe(false);
    expect(fs.statSync("/link.txt").isFile()).toBe(true);
  });

  it("chmodSync changes the mode statSync reports", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/a.sh", "#!/bin/sh\n");
    expect(fs.statSync("/a.sh").mode).toBe(0o644);

    fs.chmodSync("/a.sh", 0o755);
    expect(fs.statSync("/a.sh").mode).toBe(0o755);
  });

  it("constants exposes the same O_* flags require('constants') does (real tar's own get-write-flag.js destructures fs.constants directly)", () => {
    const fs = createFsBuiltin(makeIO());
    expect(fs.constants.O_CREAT).toBeTypeOf("number");
    expect(fs.constants.O_TRUNC).toBeTypeOf("number");
    expect(fs.constants.O_WRONLY).toBeTypeOf("number");
  });

  it("realpathSync resolves a symlink to its target's canonical path", () => {
    const fs = createFsBuiltin(makeIO());
    fs.mkdirSync("/a", { recursive: true });
    fs.writeFileSync("/real.txt", "hi");
    fs.symlinkSync("../real.txt", "/a/link.txt");

    expect(fs.realpathSync("/a/link.txt")).toBe("/real.txt");
  });

  it("realpathSync.native is the same resolver, not a missing/different function (real npm's own path-scurry dependency calls .native directly)", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/real.txt", "hi");
    fs.symlinkSync("/real.txt", "/link.txt");

    expect(typeof fs.realpathSync.native).toBe("function");
    expect(fs.realpathSync.native("/link.txt")).toBe("/real.txt");
  });

  // Traced need: real Vite's own dev-server startup calls fs.watch()
  // directly (chokidar's fallback createFsWatchInstance) - crashed with
  // "fs.watch is not a function" before this existed at all. With no
  // watchBridge injected (the default createFsBuiltin() gets in every other
  // test in this file), real notifications aren't wired up - this only
  // asserts it's callable and returns a real, well-behaved watcher handle,
  // not that it observes anything. See the "watch() with a real watchBridge"
  // describe block below for the actual notification-delivery behavior.
  it("watch() returns a closeable handle and accepts a listener without throwing", () => {
    const fs = createFsBuiltin(makeIO());
    const seen: unknown[] = [];
    const watcher = fs.watch("/src", (eventType, filename) => seen.push([eventType, filename]));

    expect(typeof watcher.close).toBe("function");
    expect(() => watcher.on("change", () => {})).not.toThrow();
    expect(() => watcher.close()).not.toThrow();
  });

  // Exercises the real wiring worker.ts's own createFsWatchBridge provides
  // live (see PROGRESS.md item 11's own follow-up) - a fake bridge here
  // stands in for the real kernel/FS-Worker round trip, since that's
  // integration-level plumbing this file's own unit tests don't reach.
  describe("watch() with a real watchBridge", () => {
    const makeFakeWatchBridge = () => {
      const registrations: Array<{ path: string; recursive: boolean; fire: (eventType: "change" | "rename", filename: string | null) => void }> = [];
      const closed: string[] = [];
      return {
        registrations,
        closed,
        watchBridge: {
          watch(path: string, recursive: boolean, onEvent: (eventType: "change" | "rename", filename: string | null) => void) {
            registrations.push({ path, recursive, fire: onEvent });
            return { close: () => closed.push(path) };
          },
        },
      };
    };

    it("registers with the bridge using the watched path and recursive flag", () => {
      const { registrations, watchBridge } = makeFakeWatchBridge();
      const fs = createFsBuiltin(makeIO(), undefined, undefined, undefined, watchBridge);

      fs.watch("/src", { recursive: true }, () => {});

      expect(registrations).toEqual([{ path: "/src", recursive: true, fire: expect.any(Function) }]);
    });

    it("defaults recursive to false when no options are passed", () => {
      const { registrations, watchBridge } = makeFakeWatchBridge();
      const fs = createFsBuiltin(makeIO(), undefined, undefined, undefined, watchBridge);

      fs.watch("/src", () => {});

      expect(registrations[0]?.recursive).toBe(false);
    });

    it("delivers a bridge event to every registered change listener", () => {
      const { registrations, watchBridge } = makeFakeWatchBridge();
      const fs = createFsBuiltin(makeIO(), undefined, undefined, undefined, watchBridge);
      const seenFromCtor: unknown[] = [];
      const seenFromOn: unknown[] = [];
      const watcher = fs.watch("/src", (eventType, filename) => seenFromCtor.push([eventType, filename]));
      watcher.on("change", (eventType, filename) => seenFromOn.push([eventType, filename]));

      registrations[0]!.fire("change", "a.txt");

      expect(seenFromCtor).toEqual([["change", "a.txt"]]);
      expect(seenFromOn).toEqual([["change", "a.txt"]]);
    });

    it("close() closes the underlying bridge handle and stops delivering events", () => {
      const { registrations, closed, watchBridge } = makeFakeWatchBridge();
      const fs = createFsBuiltin(makeIO(), undefined, undefined, undefined, watchBridge);
      const seen: unknown[] = [];
      const watcher = fs.watch("/src", (eventType, filename) => seen.push([eventType, filename]));

      watcher.close();
      registrations[0]!.fire("change", "a.txt");

      expect(closed).toEqual(["/src"]);
      expect(seen).toEqual([]);
    });
  });
});

// Traced need: fs-minipass (real tar's own dependency, used to physically
// write/read extracted package files during `npm install`) is built
// entirely around open/read/write/close by fd, with writev() as its
// multi-buffer-flush fast path - see fs.ts's own doc comment on
// createFsBuiltin for how a VFS with no real OS fds backs this.
describe("createFsBuiltin fd-based I/O", () => {
  it("openSync('w') + writeSync + closeSync persists the written bytes to the VFS path", () => {
    const fs = createFsBuiltin(makeIO());
    const fd = fs.openSync("/out.txt", "w");
    const bytes = new TextEncoder().encode("hello");
    fs.writeSync(fd, bytes, 0, bytes.length, null);
    fs.closeSync(fd);

    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("hello");
  });

  it("openSync('wx') creates/truncates just like 'w' (real npm's own cacache opens its tmp files with exactly this flag)", () => {
    const fs = createFsBuiltin(makeIO());
    const fd = fs.openSync("/out.txt", "wx");
    const bytes = new TextEncoder().encode("hello");
    fs.writeSync(fd, bytes, 0, bytes.length, null);
    fs.closeSync(fd);

    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("hello");
  });

  it("sequential writeSync calls (position: null) append in order, matching a real WriteStream's usage", () => {
    const fs = createFsBuiltin(makeIO());
    const fd = fs.openSync("/out.txt", "w");
    for (const chunk of ["a", "b", "c"]) {
      const bytes = new TextEncoder().encode(chunk);
      fs.writeSync(fd, bytes, 0, bytes.length, null);
    }
    fs.closeSync(fd);

    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("abc");
  });

  it("an explicit numeric position writes at that offset without moving the sequential cursor", () => {
    const fs = createFsBuiltin(makeIO());
    const fd = fs.openSync("/out.txt", "w");
    const abc = new TextEncoder().encode("abc");
    fs.writeSync(fd, abc, 0, abc.length, null); // cursor now at 3
    const x = new TextEncoder().encode("X");
    fs.writeSync(fd, x, 0, x.length, 1); // explicit position - overwrite index 1, cursor unmoved
    const d = new TextEncoder().encode("d");
    fs.writeSync(fd, d, 0, d.length, null); // resumes from the sequential cursor (3)
    fs.closeSync(fd);

    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("aXcd");
  });

  it("writev() writes multiple buffers in order and reports the total bytes written", async () => {
    const fs = createFsBuiltin(makeIO());
    const fd = fs.openSync("/out.txt", "w");
    const result = await new Promise<{ error: unknown; total: number | undefined }>((resolve) => {
      fs.writev(fd, [new TextEncoder().encode("foo"), new TextEncoder().encode("bar")], null, (error, total) =>
        resolve({ error, total }),
      );
    });
    fs.closeSync(fd);

    expect(result.error).toBeNull();
    expect(result.total).toBe(6);
    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("foobar");
  });

  it("openSync('r') + readSync reads back what was written, advancing the cursor across calls", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/in.txt", "hello world");
    const fd = fs.openSync("/in.txt", "r");

    const first = new Uint8Array(5);
    const firstRead = fs.readSync(fd, first, 0, 5, null);
    const second = new Uint8Array(6);
    const secondRead = fs.readSync(fd, second, 0, 6, null);
    fs.closeSync(fd);

    expect(firstRead).toBe(5);
    expect(new TextDecoder().decode(first)).toBe("hello");
    expect(secondRead).toBe(6);
    expect(new TextDecoder().decode(second)).toBe(" world");
  });

  it("openSync('r+') on a missing file throws ENOENT (fs-minipass's WriteStream relies on exactly this to retry with 'w')", () => {
    const fs = createFsBuiltin(makeIO());
    expect(() => fs.openSync("/missing.txt", "r+")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("openSync('r+') on an existing file preserves its content for in-place overwrites", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/out.txt", "abc");
    const fd = fs.openSync("/out.txt", "r+");
    const x = new TextEncoder().encode("X");
    fs.writeSync(fd, x, 0, x.length, 1);
    fs.closeSync(fd);

    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("aXc");
  });

  it("closeSync then any further use of the same fd throws EBADF", () => {
    const fs = createFsBuiltin(makeIO());
    const fd = fs.openSync("/out.txt", "w");
    fs.closeSync(fd);

    expect(() => fs.closeSync(fd)).toThrow(expect.objectContaining({ code: "EBADF" }));
  });

  it("writeSync on a fd opened for reading throws EBADF", () => {
    const fs = createFsBuiltin(makeIO());
    fs.writeFileSync("/in.txt", "hi");
    const fd = fs.openSync("/in.txt", "r");

    expect(() => fs.writeSync(fd, new Uint8Array(1), 0, 1, null)).toThrow(expect.objectContaining({ code: "EBADF" }));
  });

  it("the callback-style open/write/read/close variants defer via the provided nextTick, not synchronously", async () => {
    const calls: string[] = [];
    let nextTickInvocations = 0;
    const fs = createFsBuiltin(makeIO(), (cb) => {
      nextTickInvocations++;
      queueMicrotask(cb);
    });

    const fd = await new Promise<number>((resolve) => {
      fs.open("/out.txt", "w", (_error, openedFd) => resolve(openedFd!));
      calls.push("open() returned control before its callback ran");
    });
    expect(calls).toEqual(["open() returned control before its callback ran"]);

    const bytes = new TextEncoder().encode("hi");
    await new Promise<void>((resolve) => fs.write(fd, bytes, 0, bytes.length, null, () => resolve()));
    await new Promise<void>((resolve) => fs.close(fd, () => resolve()));

    expect(nextTickInvocations).toBe(3); // open + write + close
    expect(new TextDecoder().decode(fs.readFileSync("/out.txt"))).toBe("hi");
  });
});

describe("createFsBuiltin readFile (callback form)", () => {
  it("defers via the provided nextTick and hands the callback bytes, not a promise", async () => {
    let nextTickInvocations = 0;
    const fs = createFsBuiltin(makeIO(), (cb) => {
      nextTickInvocations++;
      queueMicrotask(cb);
    });
    fs.writeFileSync("/a.txt", "hi");

    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      fs.readFile("/a.txt", (error, result) => (error ? reject(error) : resolve(result!)));
    });
    expect(nextTickInvocations).toBe(1);
    expect(new TextDecoder().decode(bytes)).toBe("hi");
  });

  it("wraps the result through the provided wrapBuffer (real npm's own read-cmd-shim calls .toString() on this, which only UTF-8-decodes on a real Buffer, not a bare Uint8Array)", async () => {
    class FakeBuffer extends Uint8Array {
      toString() {
        return `wrapped:${new TextDecoder().decode(this)}`;
      }
    }
    const fs = createFsBuiltin(
      makeIO(),
      (cb) => cb(),
      (bytes) => new FakeBuffer(bytes),
    );
    fs.writeFileSync("/a.txt", "hi");

    const result = await new Promise<Uint8Array>((resolve, reject) => {
      fs.readFile("/a.txt", (error, data) => (error ? reject(error) : resolve(data!)));
    });
    expect(result.toString()).toBe("wrapped:hi");
  });

  it("rejects (via the callback's error) for a missing file", async () => {
    const fs = createFsBuiltin(makeIO());
    const error = await new Promise((resolve) => {
      fs.readFile("/missing", (err) => resolve(err));
    });
    expect(error).toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});

describe("createFsBuiltin stat (callback form)", () => {
  it("defers via the provided nextTick and hands the callback a StatResult (real npm's own mkdirp checks a directory this way before creating it)", async () => {
    let nextTickInvocations = 0;
    const fs = createFsBuiltin(makeIO(), (cb) => {
      nextTickInvocations++;
      queueMicrotask(cb);
    });
    fs.mkdirSync("/dir");

    const stat = await new Promise<{ isDirectory(): boolean }>((resolve, reject) => {
      fs.stat("/dir", (error, result) => (error ? reject(error) : resolve(result!)));
    });
    expect(nextTickInvocations).toBe(1);
    expect(stat.isDirectory()).toBe(true);
  });

  it("rejects (via the callback's error) for a missing path", async () => {
    const fs = createFsBuiltin(makeIO());
    const error = await new Promise((resolve) => {
      fs.stat("/missing", (err) => resolve(err));
    });
    expect(error).toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});

// Traced need: real Vite's own dist/node/chunks/node.js does
// `import { readdir } from 'node:fs'` at its top level - the callback-form
// counterpart to readdirSync, same relationship stat/lstat/readFile already
// have with their own *Sync forms.
describe("createFsBuiltin readdir (callback form)", () => {
  it("defers via the provided nextTick and hands the callback the same names as readdirSync", async () => {
    let nextTickInvocations = 0;
    const fs = createFsBuiltin(makeIO(), (cb) => {
      nextTickInvocations++;
      queueMicrotask(cb);
    });
    fs.mkdirSync("/src");
    fs.writeFileSync("/src/a.js", "");

    const names = await new Promise<string[]>((resolve, reject) => {
      fs.readdir("/src", (error, result) => (error ? reject(error) : resolve(result!)));
    });
    expect(nextTickInvocations).toBe(1);
    expect(names).toEqual(["a.js"]);
  });

  it("rejects (via the callback's error) for a missing path", async () => {
    const fs = createFsBuiltin(makeIO());
    const error = await new Promise((resolve) => {
      fs.readdir("/missing", (err) => resolve(err));
    });
    expect(error).toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});

// Traced need: real Vite's own dist/node/chunks/node.js does
// `import { realpath } from 'node:fs'` at its top level - the callback-form
// counterpart to realpathSync.
describe("createFsBuiltin realpath (callback form)", () => {
  it("defers via the provided nextTick and hands the callback the same path as realpathSync", async () => {
    let nextTickInvocations = 0;
    const fs = createFsBuiltin(makeIO(), (cb) => {
      nextTickInvocations++;
      queueMicrotask(cb);
    });
    fs.writeFileSync("/a.txt", "hi");

    const resolved = await new Promise<string>((resolve, reject) => {
      fs.realpath("/a.txt", (error, result) => (error ? reject(error) : resolve(result!)));
    });
    expect(nextTickInvocations).toBe(1);
    expect(resolved).toBe(fs.realpathSync("/a.txt"));
  });

  it("rejects (via the callback's error) for a missing path", async () => {
    const fs = createFsBuiltin(makeIO());
    const error = await new Promise((resolve) => {
      fs.realpath("/missing", (err) => resolve(err));
    });
    expect(error).toEqual(expect.objectContaining({ code: "ENOENT" }));
  });
});

// Real tar's own lib/mkdir.js and lib/unpack.js call every one of these
// while physically recreating a package's directory tree during
// extraction - traced need: `npm install left-pad` reaching real tar's
// directory-creation retry logic (onmkdir's error handler calls fs.lstat
// to distinguish "already exists as a directory, fine" from a real
// conflict), which crashed outright when these callback-form methods
// didn't exist yet.
describe("createFsBuiltin extraction-support callback methods (lstat/mkdir/chmod/unlink/rmdir/rename/chown/utimes)", () => {
  const callback = <T>(fn: (cb: (error: unknown, result?: T) => void) => void): Promise<T> =>
    new Promise((resolve, reject) => fn((error, result) => (error ? reject(error) : resolve(result as T))));

  it("lstat resolves a StatResult and rejects ENOENT for a missing path", async () => {
    const fs = createFsBuiltin(makeIO(), (cb) => queueMicrotask(cb));
    fs.writeFileSync("/a.txt", "hi");
    const stat = await callback<{ isFile(): boolean }>((cb) => fs.lstat("/a.txt", cb));
    expect(stat.isFile()).toBe(true);
    await expect(callback((cb) => fs.lstat("/missing", cb))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("mkdir (both the 2-arg and 3-arg forms) creates a directory, and throws EEXIST on a second call - the exact signal real tar's onmkdir error handler branches on", async () => {
    const fs = createFsBuiltin(makeIO(), (cb) => queueMicrotask(cb));
    await callback((cb) => fs.mkdir("/dir", cb));
    expect(fs.existsSync("/dir")).toBe(true);
    await expect(callback((cb) => fs.mkdir("/dir", 0o755, cb))).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("chmod changes the mode real npm's own get-write-flag.js later reads back via statSync", async () => {
    const fs = createFsBuiltin(makeIO(), (cb) => queueMicrotask(cb));
    fs.writeFileSync("/a.sh", "#!/bin/sh\n");
    await callback((cb) => fs.chmod("/a.sh", 0o755, cb));
    expect(fs.statSync("/a.sh").mode.toString(8)).toBe("755");
  });

  it("unlink removes a file", async () => {
    const fs = createFsBuiltin(makeIO(), (cb) => queueMicrotask(cb));
    fs.writeFileSync("/a.txt", "hi");
    await callback((cb) => fs.unlink("/a.txt", cb));
    expect(fs.existsSync("/a.txt")).toBe(false);
  });

  it("rmdir removes a directory", async () => {
    const fs = createFsBuiltin(makeIO(), (cb) => queueMicrotask(cb));
    fs.mkdirSync("/dir");
    await callback((cb) => fs.rmdir("/dir", cb));
    expect(fs.existsSync("/dir")).toBe(false);
  });

  it("rename moves a file", async () => {
    const fs = createFsBuiltin(makeIO(), (cb) => queueMicrotask(cb));
    fs.writeFileSync("/a.txt", "hi");
    await callback((cb) => fs.rename("/a.txt", "/b.txt", cb));
    expect(fs.existsSync("/a.txt")).toBe(false);
    expect(new TextDecoder().decode(fs.readFileSync("/b.txt"))).toBe("hi");
  });

  it("chown/fchown/utimes/futimes exist and succeed as no-ops (no real multi-user ownership or mtime-preservation model in this VFS - real tar's Unpack calls these unconditionally while restoring an extracted entry's metadata)", async () => {
    const fs = createFsBuiltin(makeIO(), (cb) => queueMicrotask(cb));
    fs.writeFileSync("/a.txt", "hi");
    await expect(callback((cb) => fs.chown("/a.txt", 501, 20, cb))).resolves.toBeUndefined();
    await expect(callback((cb) => fs.fchown(3, 501, 20, cb))).resolves.toBeUndefined();
    await expect(callback((cb) => fs.utimes("/a.txt", 0, 0, cb))).resolves.toBeUndefined();
    await expect(callback((cb) => fs.futimes(3, 0, 0, cb))).resolves.toBeUndefined();
  });
});

describe("createFsPromisesBuiltin", () => {
  // Traced need: real Vite's own dist/node/chunks/node.js does
  // `import { constants, ... } from 'node:fs/promises'` at its top level -
  // a plain passthrough (real Node's fs.promises.constants is the same
  // object as fs.constants), not a promise-wrapped async method.
  it("constants is the same object as fs.constants (a plain passthrough)", () => {
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));
    expect(fsPromises.constants).toBe(fs.constants);
  });

  it("readFile with no options still wraps through the provided wrapBuffer (real npm's own cacache does `(await fs.promises.readFile(path)).toString()` on cached content)", async () => {
    class FakeBuffer extends Uint8Array {
      toString() {
        return `wrapped:${new TextDecoder().decode(this)}`;
      }
    }
    const fs = createFsBuiltin(
      makeIO(),
      (cb) => queueMicrotask(cb),
      (bytes) => new FakeBuffer(bytes),
    );
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));
    fs.writeFileSync("/a.txt", "hi");

    const result = await fsPromises.readFile("/a.txt");
    expect(result.toString()).toBe("wrapped:hi");
  });

  it("open() returns a FileHandle whose read()/close() work (real npm's own bin-links sniffs a script's hashbang line this way)", async () => {
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));
    fs.writeFileSync("/script.js", "#!/usr/bin/env node\nconsole.log('hi');\n");

    const fh = await fsPromises.open("/script.js", "r");
    const buf = new Uint8Array(8);
    const { bytesRead, buffer } = await fh.read(buf, 0, 8, 0);
    expect(bytesRead).toBe(8);
    expect(buffer).toBe(buf); // real Node hands back the SAME buffer it was given
    expect(new TextDecoder().decode(buf)).toBe("#!/usr/b");
    await fh.close();
  });

  it("resolves every call through the provided nextTick, not a bare native microtask", async () => {
    // Regression test: a plain `async (path) => fs.readFileSync(path)` looks
    // identical from the caller's side but resolves via an untracked native
    // microtask - real npm's own `await fs.mkdir(...)`/`isexe`'s
    // `await fs.promises.stat(...)` silently never completed because of
    // this (see worker.ts's own boot()/drain(): a process with nothing else
    // tracked tears itself down before an untracked microtask's continuation
    // ever runs). Asserting nextTick is what actually drives resolution -
    // not just that the promise eventually settles - is the point of this test.
    let nextTickCalls = 0;
    const nextTick = (callback: () => void) => {
      nextTickCalls++;
      queueMicrotask(callback);
    };
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, nextTick);

    await fsPromises.writeFile("/a.txt", "hi");
    expect(nextTickCalls).toBe(1);

    const contents = await fsPromises.readFile("/a.txt");
    expect(nextTickCalls).toBe(2);
    expect(new TextDecoder().decode(contents)).toBe("hi");
  });

  it("rejects (not throws synchronously) for a missing file, preserving the FSError code", async () => {
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));

    await expect(fsPromises.readFile("/missing")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("access() resolves for an existing path and rejects for a missing one", async () => {
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));
    fs.writeFileSync("/a.txt", "hi");

    await expect(fsPromises.access("/a.txt")).resolves.toBeUndefined();
    await expect(fsPromises.access("/missing")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("appendFile creates then appends, resolving through the provided nextTick (real npm's own cacache does this to grow its index bucket files)", async () => {
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));

    await fsPromises.appendFile("/index.txt", "first\n");
    await fsPromises.appendFile("/index.txt", "second\n");
    await expect(fsPromises.readFile("/index.txt")).resolves.toEqual(new TextEncoder().encode("first\nsecond\n"));
  });

  it("mkdir + readdir round-trip", async () => {
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));

    await fsPromises.mkdir("/src", { recursive: true });
    await fsPromises.writeFile("/src/a.js", "a");
    await expect(fsPromises.readdir("/src")).resolves.toEqual(["a.js"]);
  });

  it("realpath resolves a symlink to its target's canonical path", async () => {
    const fs = createFsBuiltin(makeIO());
    const fsPromises = createFsPromisesBuiltin(fs, (cb) => queueMicrotask(cb));
    fs.writeFileSync("/real.txt", "hi");
    fs.symlinkSync("/real.txt", "/link.txt");

    await expect(fsPromises.realpath("/link.txt")).resolves.toBe("/real.txt");
  });
});
