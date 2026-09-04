import type { ProcessTable } from "../../kernel/processTable";
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

interface ProcessClient {
  spawn(payload: SpawnPayload): Promise<{ processId: string }>;
}

const decoder = new TextDecoder();

const readFileAsText = (fsClient: FsClient) => async (path: string): Promise<string> => {
  const bytes = await fsClient.request<Uint8Array>({ action: "readFile", path });
  return decoder.decode(bytes);
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

    postWithTransfer(worker, { type: "boot", payload: { entryPath, sources, argv, env, cwd } });

    return { processId };
  };

  return { spawn };
};

export { createProcessClient };
export type { ProcessClient, SpawnPayload };
