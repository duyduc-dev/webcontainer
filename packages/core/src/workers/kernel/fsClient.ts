import { createRequest, isReply } from "../../protocol/envelope";
import type { ReplyEnvelope } from "../../protocol/envelope";
import { DWCError } from "../../protocol/errors";
import { postWithTransfer } from "../../protocol/transfer";
import { spawnChildWorker } from "./spawn";

interface FsClient {
  request<T = unknown>(payload: unknown): Promise<T>;
}

/** Lazily spawns the FS Worker on first use and proxies FS_REQUEST envelopes to it. */
const createFsClient = (): FsClient => {
  let worker: Worker | null = null;
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();

  const ensureWorker = (): Worker => {
    if (worker) return worker;

    const fsWorker = spawnChildWorker(new URL("../fs/worker.js", import.meta.url), { name: "FsWorker" });
    fsWorker.onmessage = (event: MessageEvent<ReplyEnvelope>) => {
      const data = event.data;
      if (!isReply(data)) return;

      const waiting = pending.get(data.id);
      if (!waiting) return;
      pending.delete(data.id);

      if (data.ok) waiting.resolve(data.result);
      else waiting.reject(new DWCError(data.error.code, data.error.message));
    };

    worker = fsWorker;
    return fsWorker;
  };

  return {
    request<T = unknown>(payload: unknown): Promise<T> {
      const fsWorker = ensureWorker();
      const id = crypto.randomUUID();
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        postWithTransfer(fsWorker, createRequest(id, "FS_REQUEST", payload));
      });
    },
  };
};

export { createFsClient };
export type { FsClient };
