interface ShellExecResult {
  output: string;
  cwd: string;
}

interface ShellAPI {
  exec(line: string, options?: { cwd?: string }): Promise<ShellExecResult>;
}

type Requester = <T = unknown>(type: string, payload?: unknown) => Promise<T>;

/** Public `dwc.shell` facade - runs a line through the shell-as-process (needs cross-origin isolation). */
const createShellAPI = (request: Requester): ShellAPI => ({
  exec: (line, options = {}) => request<ShellExecResult>("SHELL_EXEC", { line, cwd: options.cwd ?? "/" }),
});

export { createShellAPI };
export type { ShellAPI, ShellExecResult };
