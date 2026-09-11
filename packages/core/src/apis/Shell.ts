import { createPushableReadableStream } from "../runtime/streams";

interface ShellExecResult {
  output: string;
  cwd: string;
}

interface ShellSpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
}

interface ShellHandle {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exit: Promise<number>;
  /** Terminates whichever command is currently running in this line's `&&`
   * chain, resolving `exit` with 143 - same convention dwc.process.spawn()'s
   * kill() uses. */
  kill(): void;
}

interface ShellAPI {
  exec(line: string, options?: { cwd?: string }): Promise<ShellExecResult>;
  /** Streaming counterpart to exec(): same shell-line semantics (`&&`
   * chaining, `cd`, PATH-resolved commands), but stdout/stderr arrive AS
   * PRODUCED instead of only once the whole line finishes - use this for
   * anything long-running you want to show progress for (e.g. `npm
   * install`), where exec()'s fully-buffered result would otherwise look
   * indistinguishable from a hang until it completes. */
  spawn(line: string, options?: ShellSpawnOptions): Promise<ShellHandle>;
}

type Requester = <T = unknown>(type: string, payload?: unknown) => Promise<T>;
type Subscriber = (type: string, handler: (payload?: any) => void) => () => void;

/** Public `dwc.shell` facade - runs a line through the shell-as-process (needs cross-origin isolation). */
const createShellAPI = (request: Requester, on: Subscriber): ShellAPI => ({
  exec: (line, options = {}) => request<ShellExecResult>("SHELL_EXEC", { line, cwd: options.cwd ?? "/" }),

  async spawn(line, options = {}) {
    const { shellId } = await request<{ shellId: string }>("SHELL_SPAWN", {
      line,
      cwd: options.cwd ?? "/",
      env: options.env,
    });

    const stdoutSink = createPushableReadableStream();
    const stderrSink = createPushableReadableStream();

    const offStdout = on("shell:stdout", (payload: { shellId: string; chunk: Uint8Array }) => {
      if (payload.shellId === shellId) stdoutSink.push(payload.chunk);
    });
    const offStderr = on("shell:stderr", (payload: { shellId: string; chunk: Uint8Array }) => {
      if (payload.shellId === shellId) stderrSink.push(payload.chunk);
    });

    const exit = new Promise<number>((resolve) => {
      const offExit = on("shell:exit", (payload: { shellId: string; code: number }) => {
        if (payload.shellId !== shellId) return;
        offExit();
        offStdout();
        offStderr();
        stdoutSink.close();
        stderrSink.close();
        resolve(payload.code);
      });
    });

    const kill = (): void => {
      request("SHELL_KILL", { shellId }).catch(() => {});
    };

    return { stdout: stdoutSink.stream, stderr: stderrSink.stream, exit, kill };
  },
});

export { createShellAPI };
export type { ShellAPI, ShellExecResult, ShellHandle, ShellSpawnOptions };
