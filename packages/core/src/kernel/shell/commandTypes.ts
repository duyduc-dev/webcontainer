import { ShellContext } from "./builtins";

export type DataCallback = (stream: "stdout" | "stderr", chunk: string) => void;

export type AsyncCommandResult = { exitCode: number; cwd?: string };

export type AsyncCommand = (
  args: string[],
  ctx: ShellContext,
  onData: DataCallback,
) => Promise<AsyncCommandResult>;
