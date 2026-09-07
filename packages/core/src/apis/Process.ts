import { createForwardingWritableStream, createPushableReadableStream } from "../runtime/streams";

interface SpawnOptions {
  argv?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface ProcessHandle {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  stdin: WritableStream<Uint8Array>;
  exit: Promise<number>;
  /** Terminates the process immediately, resolving `exit` with 143 (same
   * convention a killed child_process child gets). Fire-and-forget, same
   * shape as writing to `.stdin` - a caller restarting a dev server on file
   * change has no earlier response to wait on anyway. */
  kill(): void;
}

interface ProcessAPI {
  spawn(entryPath: string, options?: SpawnOptions): Promise<ProcessHandle>;
}

type Requester = <T = unknown>(type: string, payload?: unknown) => Promise<T>;
type Subscriber = (type: string, handler: (payload?: any) => void) => () => void;

/** Public `dwc.process` facade - PROCESS_SPAWN resolves once the process starts; stdout/stderr/exit stream in via events. */
const createProcessAPI = (request: Requester, on: Subscriber): ProcessAPI => {
  return {
    async spawn(entryPath, options = {}) {
      const { processId } = await request<{ processId: string }>("PROCESS_SPAWN", {
        entryPath,
        argv: options.argv ?? [],
        env: options.env ?? {},
        cwd: options.cwd ?? "/",
      });

      const stdoutSink = createPushableReadableStream();
      const stderrSink = createPushableReadableStream();

      const offStdout = on("process:stdout", (payload: { processId: string; chunk: Uint8Array }) => {
        if (payload.processId === processId) stdoutSink.push(payload.chunk);
      });
      const offStderr = on("process:stderr", (payload: { processId: string; chunk: Uint8Array }) => {
        if (payload.processId === processId) stderrSink.push(payload.chunk);
      });

      const exit = new Promise<number>((resolve) => {
        const offExit = on("process:exit", (payload: { processId: string; code: number }) => {
          if (payload.processId !== processId) return;
          offExit();
          offStdout();
          offStderr();
          stdoutSink.close();
          stderrSink.close();
          resolve(payload.code);
        });
      });

      const stdin = createForwardingWritableStream((chunk) => {
        request("PROCESS_STDIN", { processId, chunk }).catch(() => {});
      });

      const kill = (): void => {
        request("PROCESS_KILL", { processId }).catch(() => {});
      };

      return { stdout: stdoutSink.stream, stderr: stderrSink.stream, stdin, exit, kill };
    },
  };
};

export { createProcessAPI };
export type { ProcessAPI, ProcessHandle, SpawnOptions };
