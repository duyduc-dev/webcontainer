import { createEventLoop } from "../../runtime/eventLoop";
import { createModuleLoader } from "../../runtime/moduleLoader";
import { postEvent } from "./service";

interface BootPayload {
  entryPath: string;
  sources: Record<string, string>;
  argv: string[];
  env: Record<string, string>;
  cwd: string;
}

const encoder = new TextEncoder();

let exitCode = 0;
let exited = false;

const exitProcess = (code: number): void => {
  if (exited) return;
  exited = true;
  postEvent("exit", { code });
};

const write = (stream: "stdout" | "stderr", text: string): void => {
  postEvent(stream, { chunk: encoder.encode(text) });
};

const boot = (payload: BootPayload): void => {
  const eventLoop = createEventLoop();

  const processGlobal = {
    argv: ["node", payload.entryPath, ...payload.argv],
    env: payload.env,
    cwd: () => payload.cwd,
    exitCode: 0,
    exit(code = 0) {
      exitCode = code;
      exitProcess(exitCode);
    },
    nextTick: eventLoop.nextTick,
  };

  // The module wrapper (new Function) closes over the global scope, so console/process/
  // timers must be real globals here rather than parameters threaded through requires.
  Object.assign(self, {
    console: {
      log: (...args: unknown[]) => write("stdout", `${args.map(String).join(" ")}\n`),
      info: (...args: unknown[]) => write("stdout", `${args.map(String).join(" ")}\n`),
      warn: (...args: unknown[]) => write("stderr", `${args.map(String).join(" ")}\n`),
      error: (...args: unknown[]) => write("stderr", `${args.map(String).join(" ")}\n`),
    },
    process: processGlobal,
    setTimeout: eventLoop.setTimeout,
    clearTimeout: eventLoop.clearTimeout,
    setImmediate: eventLoop.setImmediate,
    clearImmediate: eventLoop.clearImmediate,
  });

  const moduleLoader = createModuleLoader({ sources: payload.sources });

  try {
    moduleLoader.run(payload.entryPath);
  } catch (error) {
    write("stderr", `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    exitProcess(1);
    return;
  }

  void drain(eventLoop).then(() => exitProcess(exitCode));
};

const drain = async (eventLoop: ReturnType<typeof createEventLoop>): Promise<void> => {
  while (eventLoop.hasPendingWork()) {
    const didWork = await eventLoop.runOnce();
    if (!didWork) break;
  }
};

self.onmessage = (event: MessageEvent<{ type: string; payload?: unknown }>) => {
  if (event.data.type === "boot") boot(event.data.payload as BootPayload);
};
