import {
  KernelBTWEventMessage,
  KernelBTWEventType,
} from "../../models/kernel/KernelBridgeToWorkerModels";
import {
  KernelWTBEventMessage,
  KernelWTBEventType,
} from "../../models/kernel/KernelWorkerToBridgeModels";
import { VirtualFileSystem } from "../../kernel/fs/VirtualFileSystem";
import { FSError } from "../../kernel/fs/FSError";
import { Shell } from "../../kernel/shell/Shell";
import { Logger } from "../../utilities/logger";

const logger = new Logger("KernelWorker");
const vfs = new VirtualFileSystem();
const shells = new Map<string, Shell>([["default", new Shell("default", vfs)]]);

const workPostMessage = (event: KernelWTBEventMessage) =>
  self.postMessage({ ...event });

const log = (...args: any[]) => logger.info(...args);

log("Kernel Worker initialized");
workPostMessage({
  type: KernelWTBEventType.PING,
});

function handleFsRequest(
  message: Extract<
    KernelBTWEventMessage,
    { type: KernelBTWEventType.FS_REQUEST }
  >,
) {
  try {
    let result: unknown;
    switch (message.op) {
      case "mkdir":
        vfs.mkdir(message.path, { recursive: message.recursive });
        break;
      case "writeFile":
        vfs.writeFile(message.path, message.data);
        break;
      case "readFile":
        result = vfs.readFile(message.path);
        break;
      case "readdir":
        result = vfs.readdir(message.path);
        break;
      case "stat":
        result = vfs.stat(message.path);
        break;
      case "rm":
        vfs.rm(message.path, { recursive: message.recursive });
        break;
      case "rename":
        vfs.rename(message.from, message.to);
        break;
    }
    workPostMessage({
      type: KernelWTBEventType.FS_RESPONSE,
      requestId: message.requestId,
      ok: true,
      result,
    });
  } catch (error) {
    const fsError =
      error instanceof FSError
        ? error
        : new FSError("EINVAL", "", String(error));
    workPostMessage({
      type: KernelWTBEventType.FS_RESPONSE,
      requestId: message.requestId,
      ok: false,
      error: {
        code: fsError.code,
        path: fsError.path,
        message: fsError.message,
      },
    });
  }
}

function handleShellRequest(
  message: Extract<
    KernelBTWEventMessage,
    { type: KernelBTWEventType.SHELL_REQUEST }
  >,
) {
  try {
    const shell = shells.get(message.shellId);
    if (!shell) throw new Error(`unknown shell: ${message.shellId}`);
    const result = shell.exec(message.line);
    workPostMessage({
      type: KernelWTBEventType.SHELL_RESPONSE,
      requestId: message.requestId,
      ok: true,
      result,
    });
  } catch (error) {
    workPostMessage({
      type: KernelWTBEventType.SHELL_RESPONSE,
      requestId: message.requestId,
      ok: false,
      error: { code: "EINVAL", path: "", message: String(error) },
    });
  }
}

function handleProcessSpawn(
  message: Extract<
    KernelBTWEventMessage,
    { type: KernelBTWEventType.PROCESS_SPAWN }
  >,
) {
  const processId = crypto.randomUUID();
  workPostMessage({
    type: KernelWTBEventType.PROCESS_SPAWN_ACK,
    requestId: message.requestId,
    ok: true,
    result: { processId },
  });

  const shell = shells.get(message.shellId);
  if (!shell) {
    workPostMessage({
      type: KernelWTBEventType.PROCESS_DATA,
      processId,
      stream: "stderr",
      chunk: `unknown shell: ${message.shellId}`,
    });
    workPostMessage({
      type: KernelWTBEventType.PROCESS_EXIT,
      processId,
      exitCode: 127,
      cwd: "/",
    });
    return;
  }

  const result = shell.exec(message.line);

  if (result.stdout) {
    workPostMessage({
      type: KernelWTBEventType.PROCESS_DATA,
      processId,
      stream: "stdout",
      chunk: result.stdout,
    });
  }
  if (result.stderr) {
    workPostMessage({
      type: KernelWTBEventType.PROCESS_DATA,
      processId,
      stream: "stderr",
      chunk: result.stderr,
    });
  }

  workPostMessage({
    type: KernelWTBEventType.PROCESS_EXIT,
    processId,
    exitCode: result.exitCode,
    cwd: result.cwd,
  });
}

self.onmessage = (event: MessageEvent<KernelBTWEventMessage>) => {
  const data = event.data;
  if (data.type === KernelBTWEventType.FS_REQUEST) {
    handleFsRequest(data);
    return;
  }
  if (data.type === KernelBTWEventType.SHELL_REQUEST) {
    handleShellRequest(data);
    return;
  }
  if (data.type === KernelBTWEventType.PROCESS_SPAWN) {
    handleProcessSpawn(data);
    return;
  }
  log("event", event);
};
