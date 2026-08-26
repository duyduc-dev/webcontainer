import { VirtualFileSystem } from "../fs/VirtualFileSystem";
import { tokenize } from "./tokenize";
import { builtins, ShellContext } from "./builtins";
import { runNpm } from "./npmCommand";

export type ShellExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
};

type DataCallback = (stream: "stdout" | "stderr", chunk: string) => void;
type AsyncCommand = (
  args: string[],
  ctx: ShellContext,
  onData: DataCallback,
) => Promise<{ exitCode: number; cwd?: string }>;

const asyncCommands: Record<string, AsyncCommand> = {
  npm: runNpm,
};

export class Shell {
  readonly id: string;
  private cwd: string;
  private readonly env: Record<string, string>;
  private readonly vfs: VirtualFileSystem;

  constructor(
    id: string,
    vfs: VirtualFileSystem,
    cwd = "/",
    env: Record<string, string> = {},
  ) {
    this.id = id;
    this.vfs = vfs;
    this.cwd = cwd;
    this.env = env;
  }

  exec(line: string): ShellExecResult {
    const trimmed = line.trim();
    if (trimmed === "") {
      return { stdout: "", stderr: "", exitCode: 0, cwd: this.cwd };
    }

    let tokens: string[];
    try {
      tokens = tokenize(trimmed);
    } catch (error) {
      return { stdout: "", stderr: String(error), exitCode: 2, cwd: this.cwd };
    }

    const [command, ...args] = tokens;
    const builtin = builtins[command];
    if (!builtin) {
      return {
        stdout: "",
        stderr: `${command}: command not found`,
        exitCode: 127,
        cwd: this.cwd,
      };
    }

    const ctx: ShellContext = { cwd: this.cwd, vfs: this.vfs, env: this.env };
    const result = builtin(args, ctx);

    if (result.cwd !== undefined) this.cwd = result.cwd;

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      cwd: this.cwd,
    };
  }

  async execAsync(line: string, onData?: DataCallback): Promise<ShellExecResult> {
    const trimmed = line.trim();
    if (trimmed === "") {
      return { stdout: "", stderr: "", exitCode: 0, cwd: this.cwd };
    }

    let tokens: string[];
    try {
      tokens = tokenize(trimmed);
    } catch (error) {
      return { stdout: "", stderr: String(error), exitCode: 2, cwd: this.cwd };
    }

    const [command, ...args] = tokens;
    const asyncCommand = asyncCommands[command];
    if (!asyncCommand) {
      return this.exec(line);
    }

    let stdout = "";
    let stderr = "";
    const forward: DataCallback = (stream, chunk) => {
      if (onData) {
        onData(stream, chunk);
      } else if (stream === "stdout") {
        stdout += chunk;
      } else {
        stderr += chunk;
      }
    };

    const ctx: ShellContext = { cwd: this.cwd, vfs: this.vfs, env: this.env };
    const result = await asyncCommand(args, ctx, forward);

    if (result.cwd !== undefined) this.cwd = result.cwd;

    return { stdout, stderr, exitCode: result.exitCode, cwd: this.cwd };
  }
}