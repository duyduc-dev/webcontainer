import { ShellContext } from "./builtins";
import { AsyncCommandResult, DataCallback } from "./commandTypes";
import { resolvePath } from "./resolvePath";
import { preloadModules } from "../modules/preload";
import { registerPort, unregisterWorkerPorts } from "../process/previewBridge";
import { KernelWTBEventType } from "../../models/kernel/KernelWorkerToBridgeModels";

type GuestMessage =
  | { type: "data"; stream: "stdout" | "stderr"; chunk: string }
  | { type: "exit"; exitCode: number }
  | { type: "listen"; port: number };

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
    worker.addEventListener("message", (event: MessageEvent<GuestMessage>) => {
      const message = event.data;
      if (message.type === "data") {
        onData(message.stream, message.chunk);
      } else if (message.type === "listen") {
        registerPort(message.port, worker, () => resolve(0));
        self.postMessage({ type: KernelWTBEventType.LISTEN, port: message.port });
        // Do not resolve — the process is now a long-lived server, matching a
        // real foreground server blocking a real shell until it's killed
        // (`kill <port>` resolves this via the onKilled callback above).
      } else if (message.type === "exit") {
        unregisterWorkerPorts(worker);
        resolve(message.exitCode);
      }
    });
    worker.postMessage({
      type: "boot",
      entryPath,
      sources: [...preload.sources.entries()],
      resolutions: [...preload.resolutions.entries()],
      fsFiles: [...preload.fsFiles.entries()],
      argv: rest,
      env: ctx.env,
      cwd: ctx.cwd,
    });
  });

  worker.terminate();
  return { exitCode };
}
