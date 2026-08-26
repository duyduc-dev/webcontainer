import { VirtualFileSystem } from "../fs/VirtualFileSystem";
import { tokenize } from "./tokenize";
import { builtins, ShellContext } from "./builtins";
import { runNpm } from "./npmCommand";
import { runNode } from "./nodeCommand";
import { AsyncCommand, DataCallback } from "./commandTypes";
import { splitChain } from "./chain";
import { extractRedirect, Redirect } from "./redirect";
import { resolvePath } from "./resolvePath";

export type ShellExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
};

const asyncCommands: Record<string, AsyncCommand> = {
  npm: runNpm,
  node: runNode,
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

  // Supports `&&` chaining (sequential, short-circuits on a non-zero exit
  // code, like a real shell) and `>`/`>>` output redirection.
  async execAsync(line: string, onData?: DataCallback): Promise<ShellExecResult> {
    const commands = splitChain(line);
    let result: ShellExecResult = { stdout: "", stderr: "", exitCode: 0, cwd: this.cwd };

    for (const command of commands.length > 0 ? commands : [line]) {
      result = await this.execSingleAsync(command, onData);
      if (result.exitCode !== 0) break;
    }

    return result;
  }

  private async execSingleAsync(line: string, onData?: DataCallback): Promise<ShellExecResult> {
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

    const { tokens: commandTokens, redirect } = extractRedirect(tokens);
    const [command, ...args] = commandTokens;

    let stdout = "";
    let stderr = "";
    const collect: DataCallback = (stream, chunk) => {
      if (stream === "stdout") stdout += chunk;
      else stderr += chunk;
    };
    // Redirected stdout never reaches the terminal — buffer it regardless of
    // whether the caller wants live streaming.
    const forward: DataCallback = redirect
      ? collect
      : (stream, chunk) => (onData ? onData(stream, chunk) : collect(stream, chunk));

    let exitCode: number;
    let newCwd: string | undefined;

    const asyncCommand = asyncCommands[command];
    if (asyncCommand) {
      const ctx: ShellContext = { cwd: this.cwd, vfs: this.vfs, env: this.env };
      const result = await asyncCommand(args, ctx, forward);
      exitCode = result.exitCode;
      newCwd = result.cwd;
    } else {
      const builtin = builtins[command];
      if (!builtin) {
        forward("stderr", `${command}: command not found`);
        exitCode = 127;
      } else {
        const ctx: ShellContext = { cwd: this.cwd, vfs: this.vfs, env: this.env };
        const result = builtin(args, ctx);
        forward("stdout", result.stdout);
        forward("stderr", result.stderr);
        exitCode = result.exitCode;
        newCwd = result.cwd;
      }
    }

    if (newCwd !== undefined) this.cwd = newCwd;

    if (redirect) {
      this.writeRedirect(redirect, stdout);
      return { stdout: "", stderr, exitCode, cwd: this.cwd };
    }

    return { stdout, stderr, exitCode, cwd: this.cwd };
  }

  private writeRedirect(redirect: Redirect, content: string) {
    const path = resolvePath(this.cwd, redirect.path);
    const bytes = new TextEncoder().encode(content);

    if (redirect.append && this.vfs.exists(path)) {
      const existing = this.vfs.readFile(path);
      const combined = new Uint8Array(existing.length + bytes.length);
      combined.set(existing);
      combined.set(bytes, existing.length);
      this.vfs.writeFile(path, combined);
    } else {
      this.vfs.writeFile(path, bytes);
    }
  }
}