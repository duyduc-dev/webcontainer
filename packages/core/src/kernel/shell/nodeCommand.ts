import { ShellContext } from "./builtins";
import { AsyncCommandResult, DataCallback } from "./commandTypes";
import { resolvePath } from "./resolvePath";
import { preloadModules } from "../modules/preload";

type GuestMessage =
  | { type: "data"; stream: "stdout" | "stderr"; chunk: string }
  | { type: "exit"; exitCode: number };

export async function runNode(
  args: string[],
  ctx: ShellContext,
  onData: DataCallback,
): Promise<AsyncCommandResult> {
  const [entryArg, ...rest] = args;
  if (!entryArg) {
    onData("stderr", "node: missing script argument\n");
    return { exitCode: 1 };
  }

  const entryPath = resolvePath(ctx.cwd, entryArg);
  if (!ctx.vfs.exists(entryPath)) {
    onData("stderr", `node: cannot find module '${entryArg}'\n`);
    return { exitCode: 1 };
  }

  let preload;
  try {
    preload = preloadModules(ctx.vfs, entryPath);
  } catch (error) {
    onData("stderr", `node: ${String(error)}\n`);
    return { exitCode: 1 };
  }

  const worker = new Worker(new URL("../guest/GuestWorker.js", import.meta.url), {
    type: "module",
  });

  const exitCode = await new Promise<number>((resolve) => {
    worker.onmessage = (event: MessageEvent<GuestMessage>) => {
      const message = event.data;
      if (message.type === "data") {
        onData(message.stream, message.chunk);
      } else if (message.type === "exit") {
        resolve(message.exitCode);
      }
    };
    worker.postMessage({
      type: "boot",
      entryPath,
      sources: [...preload.sources.entries()],
      resolutions: [...preload.resolutions.entries()],
      argv: rest,
      env: ctx.env,
      cwd: ctx.cwd,
    });
  });

  worker.terminate();
  return { exitCode };
}
