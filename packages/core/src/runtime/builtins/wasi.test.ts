import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createVirtualFileSystem } from "../../kernel/fs/VirtualFileSystem";
import { createSyncFsServerState, executeFsRequest } from "../../kernel/fs/syncServer";
import { createFsBuiltin } from "./fs";
import type { FsBuiltinIO } from "./fs";
import { createWasiModule } from "./wasi";

const makeIO = (): FsBuiltinIO => {
  const vfs = createVirtualFileSystem();
  const state = createSyncFsServerState();
  return { callSync: (request) => executeFsRequest(vfs, state, request) };
};

/**
 * Real, minimal wasm module (692 bytes) exercising the actual traced
 * wasi_snapshot_preview1 surface this project's own WASI shim needs (see
 * wasi.ts's own doc comment on the WebAssembly.Module.imports() trace against
 * the real @rolldown/binding-wasm32-wasi binary): path_open/fd_write/fd_read/
 * fd_close for a real file round-trip through this project's own VFS,
 * fd_write to stdout, plus environ_sizes_get/random_get/clock_time_get/
 * sched_yield called just to confirm they don't trap. `_start` sums every
 * call's returned errno into a global (0 iff every call succeeded) and
 * stores it at byte offset 448, readable via the `get_err_sum` export.
 *
 * Compiled from this WAT source via `wabt`'s `parseWat`/`toBinary` (not
 * committed as a build step - this fixture is static and only needs
 * regenerating if the syscall surface being tested changes):
 *
 *   (module
 *     (import "wasi_snapshot_preview1" "path_open"
 *       (func $path_open (param i32 i32 i32 i32 i32 i64 i64 i32 i32) (result i32)))
 *     (import "wasi_snapshot_preview1" "fd_write"
 *       (func $fd_write (param i32 i32 i32 i32) (result i32)))
 *     (import "wasi_snapshot_preview1" "fd_read"
 *       (func $fd_read (param i32 i32 i32 i32) (result i32)))
 *     (import "wasi_snapshot_preview1" "fd_close" (func $fd_close (param i32) (result i32)))
 *     (import "wasi_snapshot_preview1" "environ_sizes_get" (func $environ_sizes_get (param i32 i32) (result i32)))
 *     (import "wasi_snapshot_preview1" "random_get" (func $random_get (param i32 i32) (result i32)))
 *     (import "wasi_snapshot_preview1" "clock_time_get" (func $clock_time_get (param i32 i64 i32) (result i32)))
 *     (import "wasi_snapshot_preview1" "sched_yield" (func $sched_yield (result i32)))
 *     (memory (export "memory") 1)
 *     (data (i32.const 32) "test.txt")
 *     (data (i32.const 64) "hello wasi\\n")
 *     (global $err_sum (mut i32) (i32.const 0))
 *     (func (export "_start")
 *       (local $fd i32)
 *       (global.set $err_sum (i32.add (global.get $err_sum)
 *         (call $path_open (i32.const 3) (i32.const 0) (i32.const 32) (i32.const 8)
 *           (i32.const 1) (i64.const 148898303) (i64.const 0) (i32.const 0) (i32.const 8))))
 *       (local.set $fd (i32.load (i32.const 8)))
 *       (i32.store (i32.const 16) (i32.const 64))
 *       (i32.store (i32.const 20) (i32.const 11))
 *       (global.set $err_sum (i32.add (global.get $err_sum)
 *         (call $fd_write (local.get $fd) (i32.const 16) (i32.const 1) (i32.const 4))))
 *       (global.set $err_sum (i32.add (global.get $err_sum) (call $fd_close (local.get $fd))))
 *       (global.set $err_sum (i32.add (global.get $err_sum)
 *         (call $path_open (i32.const 3) (i32.const 0) (i32.const 32) (i32.const 8)
 *           (i32.const 0) (i64.const 148898303) (i64.const 0) (i32.const 0) (i32.const 8))))
 *       (local.set $fd (i32.load (i32.const 8)))
 *       (i32.store (i32.const 16) (i32.const 256))
 *       (i32.store (i32.const 20) (i32.const 64))
 *       (global.set $err_sum (i32.add (global.get $err_sum)
 *         (call $fd_read (local.get $fd) (i32.const 16) (i32.const 1) (i32.const 4))))
 *       (global.set $err_sum (i32.add (global.get $err_sum) (call $fd_close (local.get $fd))))
 *       (i32.store (i32.const 16) (i32.const 256))
 *       ;; address 0 is treated as an invalid/null pointer by fd_write/fd_read's
 *       ;; own EINVAL check, same convention as path_open's path/fd checks - the
 *       ;; nwritten/nread output slot lives at 4, not 0, for exactly that reason.
 *       (i32.store (i32.const 20) (i32.load (i32.const 4)))
 *       (global.set $err_sum (i32.add (global.get $err_sum)
 *         (call $fd_write (i32.const 1) (i32.const 16) (i32.const 1) (i32.const 4))))
 *       (global.set $err_sum (i32.add (global.get $err_sum)
 *         (call $environ_sizes_get (i32.const 400) (i32.const 404))))
 *       (global.set $err_sum (i32.add (global.get $err_sum)
 *         (call $random_get (i32.const 416) (i32.const 4))))
 *       (global.set $err_sum (i32.add (global.get $err_sum)
 *         (call $clock_time_get (i32.const 0) (i64.const 0) (i32.const 432))))
 *       (global.set $err_sum (i32.add (global.get $err_sum) (call $sched_yield)))
 *       (i32.store (i32.const 448) (global.get $err_sum)))
 *     (func (export "get_err_sum") (result i32) (global.get $err_sum)))
 */
const wasmPath = fileURLToPath(new URL("./__fixtures__/wasi-preview1-smoke.wasm", import.meta.url));

describe("createWasiModule", () => {
  it("services a real wasm module's path_open/fd_write/fd_read/fd_close file round-trip, plus environ/random/clock/sched_yield, with zero errno across every call", async () => {
    const fs = createFsBuiltin(makeIO());
    const stdout: string[] = [];
    const { WASI } = createWasiModule(() => fs);
    const wasi = new WASI({
      version: "preview1",
      preopens: { "/": "/" },
      print: (line: string) => stdout.push(line),
    } as ConstructorParameters<typeof WASI>[0] & { print: (line: string) => void });

    const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath), {
      wasi_snapshot_preview1: wasi.wasiImport,
    });

    wasi.start(instance);

    const errSum = (instance.exports.get_err_sum as () => number)();
    expect(errSum).toBe(0);
    expect(stdout.join("")).toContain("hello wasi");

    // The file really landed on this project's own VFS, independent of the
    // wasm module's own fd table - not just visible through fd_read.
    expect(new TextDecoder().decode(fs.readFileSync("/test.txt"))).toBe("hello wasi\n");
  });
});
