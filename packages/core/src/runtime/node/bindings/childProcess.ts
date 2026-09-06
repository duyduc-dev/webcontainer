// internalBinding('child_process') — the seam beneath the hand-written (not
// vendored) lib/child_process.js. Real Node's child_process.js reaches
// libuv's process spawning through internalBinding('spawn_sync')/'process_wrap';
// those don't translate to a Worker-based sandbox any more directly than
// net.js's TCP/pipe handles did, so — like bindings/net.ts's `netBridge` — the
// actual spawn/exec mechanics live one layer up, in the calling process
// worker's own message relay to the kernel (workers/process/worker.ts's
// createChildProcessBridge, workers/kernel/processClient.ts's "cp-spawn"/
// "cp-exec" handling). This binding is just the pass-through, so a context
// missing the bridge (e.g. a test that never wired one up) fails loudly
// rather than silently doing nothing.

interface ChildProcessSpawnHandlers {
  onStdout(chunk: Uint8Array): void;
  onStderr(chunk: Uint8Array): void;
  onExit(code: number | null, errorMessage?: string): void;
}

interface ChildProcessBridge {
  spawn(command: string, args: string[], cwd: string, env: Record<string, string>, handlers: ChildProcessSpawnHandlers): { kill(): void };
  exec(line: string, cwd: string): Promise<{ output: string; cwd: string; exitCode: number }>;
}

interface ChildProcessBindingContext {
  childProcessBridge?: ChildProcessBridge;
}

interface ChildProcessBindings {
  spawn(command: string, args: string[], cwd: string, env: Record<string, string>, handlers: ChildProcessSpawnHandlers): { kill(): void };
  exec(line: string, cwd: string): Promise<{ output: string; cwd: string; exitCode: number }>;
}

const createChildProcessBindings = (context: ChildProcessBindingContext): ChildProcessBindings => {
  const requireBridge = (): ChildProcessBridge => {
    if (!context.childProcessBridge) throw new Error("child_process is not available in this context (no cross-process bridge)");
    return context.childProcessBridge;
  };

  return {
    spawn: (command, args, cwd, env, handlers) => requireBridge().spawn(command, args, cwd, env, handlers),
    exec: (line, cwd) => requireBridge().exec(line, cwd),
  };
};

export { createChildProcessBindings };
export type { ChildProcessBindings, ChildProcessBindingContext, ChildProcessBridge, ChildProcessSpawnHandlers };
