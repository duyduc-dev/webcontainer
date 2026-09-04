import type { ProcessTable } from "../../kernel/processTable";
import { FS_SYNC_CONTROL_LENGTH, FS_SYNC_DATA_BUFFER_SIZE } from "../../kernel/fs/syncWireFormat";
import { postWithTransfer } from "../../protocol/transfer";
import { preloadModuleGraph } from "../../runtime/preload";
import type { FsClient } from "./fsClient";
import { postEvent } from "./service";
import { spawnChildWorker } from "./spawn";

interface SpawnPayload {
  entryPath: string;
  argv?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

interface ShellExecPayload {
  line: string;
  cwd?: string;
}

interface ProcessClient {
  spawn(payload: SpawnPayload): Promise<{ processId: string }>;
  runShell(payload: ShellExecPayload): Promise<{ output: string; cwd: string }>;
}

const decoder = new TextDecoder();

const readFileAsText = (fsClient: FsClient) => async (path: string): Promise<string> => {
  const bytes = await fsClient.request<Uint8Array>({ action: "readFile", path });
  return decoder.decode(bytes);
};

/**
 * When cross-origin isolated, gives a new process a dedicated MessageChannel + a pair
 * of SharedArrayBuffers to the FS Worker for synchronous fs calls (fs.*Sync). The FS
 * Worker gets its half via fsClient.attachSyncChannel(); this only wires up the port,
 * it never touches the buffers itself.
 */
const createSyncFsChannelFor = (fsClient: FsClient): { port: MessagePort; control: SharedArrayBuffer; data: SharedArrayBuffer } | null => {
  if (!self.crossOriginIsolated) return null;

  const { port1, port2 } = new MessageChannel();
  const control = new SharedArrayBuffer(FS_SYNC_CONTROL_LENGTH * Int32Array.BYTES_PER_ELEMENT);
  const data = new SharedArrayBuffer(FS_SYNC_DATA_BUFFER_SIZE);

  fsClient.attachSyncChannel({ port: port2, control, data });

  return { port: port1, control, data };
};

/** Preloads the require() graph via the FS worker, then spawns a Process Worker to run it. */
const createProcessClient = (fsClient: FsClient, processTable: ProcessTable): ProcessClient => {
  const spawn = async (payload: SpawnPayload): Promise<{ processId: string }> => {
    const { entryPath, argv = [], env = {}, cwd = "/" } = payload;

    const { sources } = await preloadModuleGraph(entryPath, readFileAsText(fsClient));

    const { id: processId } = processTable.register();
    const worker = spawnChildWorker(new URL("../process/worker.js", import.meta.url), {
      name: `Process:${processId}`,
    });

    worker.onmessage = (event: MessageEvent<{ type: string; payload?: any }>) => {
      const { type, payload: eventPayload } = event.data;

      if (type === "stdout" || type === "stderr") {
        postEvent(`process:${type}`, { processId, chunk: eventPayload.chunk });
        return;
      }

      if (type === "exit") {
        processTable.remove(processId);
        postEvent("process:exit", { processId, code: eventPayload.code });
        worker.terminate();
      }
    };

    const syncFs = createSyncFsChannelFor(fsClient);
    const transfer = syncFs ? [syncFs.port] : [];
    postWithTransfer(worker, { type: "boot", payload: { entryPath, sources, argv, env, cwd, syncFs } }, transfer);

    return { processId };
  };

  const runShell = (payload: ShellExecPayload): Promise<{ output: string; cwd: string }> => {
    const { id: processId } = processTable.register();
    const worker = spawnChildWorker(new URL("../process/worker.js", import.meta.url), {
      name: `Shell:${processId}`,
    });

    return new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ type: string; payload?: any }>) => {
        const { type, payload: eventPayload } = event.data;

        if (type === "shell-result") {
          processTable.remove(processId);
          worker.terminate();
          resolve(eventPayload);
          return;
        }

        if (type === "shell-error") {
          processTable.remove(processId);
          worker.terminate();
          reject(new Error(eventPayload.message));
        }
      };

      const syncFs = createSyncFsChannelFor(fsClient);
      const transfer = syncFs ? [syncFs.port] : [];
      postWithTransfer(
        worker,
        { type: "boot-shell", payload: { line: payload.line, cwd: payload.cwd ?? "/", syncFs } },
        transfer,
      );
    });
  };

  return { spawn, runShell };
};

export { createProcessClient };
export type { ProcessClient, ShellExecPayload, SpawnPayload };
