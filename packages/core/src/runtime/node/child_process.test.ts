import { afterEach, describe, expect, it, vi } from "vitest";
import { createEventLoop } from "../eventLoop";
import { createNodeModules } from "./loader";

interface ChildProcessSpawnHandlers {
  onStdout(chunk: Uint8Array): void;
  onStderr(chunk: Uint8Array): void;
  onExit(code: number | null, errorMessage?: string): void;
}
interface ChildProcessModule {
  spawn(command: string, args?: string[], options?: Record<string, unknown>): ChildLike;
  execFile(
    file: string,
    args: string[] | ((err: Error | null, stdout: string, stderr: string) => void),
    options?: Record<string, unknown> | ((err: Error | null, stdout: string, stderr: string) => void),
    callback?: (err: Error | null, stdout: string, stderr: string) => void,
  ): ChildLike;
  exec(
    command: string,
    options?: Record<string, unknown> | ((err: Error | null, stdout: string, stderr: string) => void),
    callback?: (err: Error | null, stdout: string, stderr: string) => void,
  ): void;
  spawnSync(): never;
  execSync(): never;
  execFileSync(file: string, args?: string[], options?: Record<string, unknown>): string;
}
interface ChildLike {
  stdout: { on(event: string, listener: (chunk: Uint8Array) => void): void };
  stderr: { on(event: string, listener: (chunk: Uint8Array) => void): void };
  on(event: string, listener: (...args: any[]) => void): void;
  kill(): boolean;
}

let stopPump: (() => void) | null = null;

afterEach(() => {
  stopPump?.();
  stopPump = null;
});

/** A fake bridge standing in for workers/process/worker.ts's real
 * createChildProcessBridge — the guest-visible module is what's under test
 * here, not the real cross-worker relay (proven live in the browser instead,
 * same as net's cross-process relay was). The vendored Readable's 'data'
 * emission and this module's process.nextTick(() => emit('error', ...)) both
 * run through the custom event loop's nextTick queue, which (like net.test.ts)
 * only drains while something is actively pumping it. */
const setup = (
  bridge: { spawn?: ReturnType<typeof vi.fn>; exec?: ReturnType<typeof vi.fn>; execFileSync?: ReturnType<typeof vi.fn> } = {},
) => {
  const eventLoop = createEventLoop();
  const process = { env: {}, cwd: () => "/", nextTick: eventLoop.nextTick };
  const nodeModules = createNodeModules(process, {
    queueClose: eventLoop.queueClose,
    ref: eventLoop.ref,
    unref: eventLoop.unref,
    childProcessBridge: {
      spawn: vi.fn(),
      exec: vi.fn(),
      execFileSync: vi.fn(),
      ...bridge,
    } as any,
  });
  const child_process = nodeModules.require("child_process") as ChildProcessModule;

  let stopped = false;
  stopPump = () => {
    stopped = true;
  };
  void (async () => {
    while (!stopped) {
      const didWork = await eventLoop.runOnce();
      if (!didWork && !eventLoop.hasPendingWork()) break;
    }
  })();

  return { child_process, eventLoop };
};

describe("child_process (guest module against a fake bridge)", () => {
  it("spawn() streams stdout/stderr and fires exit/close on success", async () => {
    let handlers!: ChildProcessSpawnHandlers;
    const { child_process } = setup({
      spawn: vi.fn((_cmd, _args, _cwd, _env, h: ChildProcessSpawnHandlers) => {
        handlers = h;
        return { kill: vi.fn() };
      }),
    });

    const child = child_process.spawn("echo", ["hi"]);
    const stdoutChunks: string[] = [];
    // The vendored Readable defers flowing-mode activation to process.nextTick,
    // so 'data' and 'exit' aren't guaranteed to arrive in call order even
    // though onStdout()/onExit() below are called back-to-back synchronously
    // (unlike the real relay, where they arrive as separate postMessages
    // across turns) — wait for both explicitly rather than assuming either
    // fires first.
    const dataPromise = new Promise<void>((resolve) => {
      child.stdout.on("data", (chunk: Uint8Array) => {
        stdoutChunks.push(new TextDecoder().decode(chunk));
        resolve();
      });
    });
    const exitPromise = new Promise<number | null>((resolve) => child.on("exit", resolve));

    handlers.onStdout(new TextEncoder().encode("hi\n"));
    handlers.onExit(0);
    const [, exitCode] = await Promise.all([dataPromise, exitPromise]);

    expect(stdoutChunks).toEqual(["hi\n"]);
    expect(exitCode).toBe(0);
  });

  it("spawn() emits 'error' and a null exit code when the command can't be resolved", async () => {
    let handlers!: ChildProcessSpawnHandlers;
    const { child_process } = setup({
      spawn: vi.fn((_cmd, _args, _cwd, _env, h: ChildProcessSpawnHandlers) => {
        handlers = h;
        return { kill: vi.fn() };
      }),
    });

    const child = child_process.spawn("nope", []);
    const errorPromise = new Promise<Error & { code?: string }>((resolve) => child.on("error", resolve));
    const exitPromise = new Promise<number | null>((resolve) => child.on("exit", resolve));
    handlers.onExit(null, "nope: command not found");

    const [error, exitCode] = await Promise.all([errorPromise, exitPromise]);
    expect(error.message).toBe("nope: command not found");
    expect(exitCode).toBeNull();
  });

  it("kill() forwards to the bridge-returned handle", () => {
    const kill = vi.fn();
    const { child_process } = setup({
      spawn: vi.fn(() => ({ kill })),
    });

    const child = child_process.spawn("sleep", ["5"]);
    expect(child.kill()).toBe(true);
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it("execFile() buffers stdout/stderr separately and reports a non-zero exit as an error", async () => {
    let handlers!: ChildProcessSpawnHandlers;
    const { child_process } = setup({
      spawn: vi.fn((_cmd, _args, _cwd, _env, h: ChildProcessSpawnHandlers) => {
        handlers = h;
        return { kill: vi.fn() };
      }),
    });

    const closePromise = new Promise<[Error & { code?: number }, string, string]>((resolve) => {
      child_process.execFile("false", [], (err, stdout, stderr) => resolve([err as Error & { code?: number }, stdout, stderr]));
    });
    handlers.onStdout(new TextEncoder().encode("out"));
    handlers.onStderr(new TextEncoder().encode("boom"));
    // Real delivery has onStdout/onStderr/onExit arrive as separate
    // postMessages across turns, giving the vendored Readable's deferred
    // (process.nextTick) flowing-mode activation time to flush 'data' before
    // 'close' fires. A macrotask boundary (unlike a microtask one) is
    // guaranteed to let the background pump's eventLoop.runOnce() complete at
    // least one full turn first, regardless of its internal scheduling.
    await new Promise((resolve) => setTimeout(resolve, 0));
    handlers.onExit(1);

    const result = await closePromise;

    const [err, stdout, stderr] = result;
    expect(stdout).toBe("out");
    expect(stderr).toBe("boom");
    expect(err.code).toBe(1);
  });

  it("exec() delegates to the bridge's shell-line runner and reports success", async () => {
    const { child_process } = setup({
      exec: vi.fn().mockResolvedValue({ output: "hi\n", cwd: "/", exitCode: 0 }),
    });

    const [err, stdout, stderr] = await new Promise<[Error | null, string, string]>((resolve) => {
      child_process.exec("echo hi", (e, out, se) => resolve([e, out, se]));
    });

    expect(err).toBeNull();
    expect(stdout).toBe("hi\n");
    expect(stderr).toBe("");
  });

  it("exec() reports a non-zero exit code as an error", async () => {
    const { child_process } = setup({
      exec: vi.fn().mockResolvedValue({ output: "", cwd: "/", exitCode: 1 }),
    });

    const [err] = await new Promise<[(Error & { code?: number }) | null]>((resolve) => {
      child_process.exec("false", (e) => resolve([e as Error & { code?: number }]));
    });

    expect(err?.code).toBe(1);
  });

  it("spawnSync/execSync throw a clear not-implemented error (no traced need yet - execFileSync IS real, see below)", () => {
    const { child_process } = setup();
    expect(() => child_process.spawnSync()).toThrow(/not implemented/);
    expect(() => child_process.execSync()).toThrow(/not implemented/);
  });

  // Traced need: real rolldown's own WebContainer-detection fallback calls
  // `execFileSync('pnpm', ['i', pkg], { cwd, stdio: 'inherit' })` directly -
  // genuinely synchronous, backed by cp.execFileSync()'s own SharedArrayBuffer
  // bridge (workers/process/syncExecClient.ts), not the async spawn/exec
  // relay above. The bridge itself is proven live in the browser (same as
  // net's cross-process relay); this only exercises the guest-visible
  // module's own real-Node-shaped contract on top of a fake bridge.
  describe("execFileSync()", () => {
    it("returns the combined output on a zero exit code", () => {
      const execFileSync = vi.fn().mockReturnValue({ exitCode: 0, output: "added 1 package\n" });
      const { child_process } = setup({ execFileSync });

      const result = child_process.execFileSync("pnpm", ["i", "left-pad"], { cwd: "/tmp/rolldown-1.0.0" });

      expect(result).toBe("added 1 package\n");
      expect(execFileSync).toHaveBeenCalledWith("pnpm", ["i", "left-pad"], "/tmp/rolldown-1.0.0", {});
    });

    it("throws a real-Node-shaped error (.status/.stdout) on a non-zero exit code", () => {
      const execFileSync = vi.fn().mockReturnValue({ exitCode: 1, output: "network error\n" });
      const { child_process } = setup({ execFileSync });

      let error: (Error & { status?: number; stdout?: string }) | undefined;
      try {
        child_process.execFileSync("pnpm", ["i", "left-pad"]);
      } catch (e) {
        error = e as Error & { status?: number; stdout?: string };
      }

      expect(error).toBeDefined();
      expect(error!.status).toBe(1);
      expect(error!.stdout).toBe("network error\n");
      expect(error!.message).toContain("Command failed");
    });

    it("propagates a thrown error from the bridge itself (e.g. command not found)", () => {
      const execFileSync = vi.fn().mockImplementation(() => {
        throw new Error("pnpm: command not found");
      });
      const { child_process } = setup({ execFileSync });

      expect(() => child_process.execFileSync("pnpm", ["i", "left-pad"])).toThrow(/command not found/);
    });
  });
});
