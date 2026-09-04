import { DWCError, ERR_WORKER } from "../../protocol/errors";

interface SpawnChildWorkerOptions {
  name: string;
}

/**
 * The single choke point for every child worker the kernel creates (FS, Process,
 * Preview, ...). Any handshake message sent to the returned worker should still go
 * through protocol/transfer.ts's postWithTransfer for transfer-list safety.
 */
const spawnChildWorker = (url: string | URL, options: SpawnChildWorkerOptions): Worker => {
  try {
    return new Worker(url, { type: "module", name: options.name });
  } catch (cause) {
    throw new DWCError(ERR_WORKER, `Failed to create ${options.name} worker: ${(cause as Error).message}`);
  }
};

export { spawnChildWorker };
export type { SpawnChildWorkerOptions };
