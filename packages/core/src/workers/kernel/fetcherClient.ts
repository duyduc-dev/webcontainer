import { createRequest, isReply } from "../../protocol/envelope";
import type { ReplyEnvelope } from "../../protocol/envelope";
import { DWCError, ERR_WORKER } from "../../protocol/errors";
import { postWithTransfer } from "../../protocol/transfer";
import { spawnChildWorker } from "./spawn";

interface NetRequestPayload {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: ArrayBuffer;
}

interface FetcherClient {
  request<T = unknown>(payload: NetRequestPayload): Promise<T>;
}

/** Lazily spawns the Fetcher Worker on first use and proxies NET_REQUEST
 * envelopes to it — the only worker with real network access. */
const createFetcherClient = (): FetcherClient => {
  let worker: Worker | null = null;
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();

  const ensureWorker = (): Worker => {
    if (worker) return worker;

    const fetcherWorker = spawnChildWorker(new URL("../fetcher/worker.js", import.meta.url), { name: "FetcherWorker" });
    fetcherWorker.onmessage = (event: MessageEvent<ReplyEnvelope>) => {
      const data = event.data;
      if (!isReply(data)) return;

      const waiting = pending.get(data.id);
      if (!waiting) return;
      pending.delete(data.id);

      if (data.ok) waiting.resolve(data.result);
      else waiting.reject(new DWCError(data.error.code, data.error.message));
    };

    fetcherWorker.onerror = (event) => {
      const error = new DWCError(ERR_WORKER, `Fetcher Worker failed to load or crashed: ${event.message || "unknown error"}`);
      for (const [id, waiting] of pending) {
        pending.delete(id);
        waiting.reject(error);
      }
    };

    worker = fetcherWorker;
    return fetcherWorker;
  };

  return {
    request<T = unknown>(payload: NetRequestPayload): Promise<T> {
      const fetcherWorker = ensureWorker();
      const id = crypto.randomUUID();
      const transfer = payload.body ? [payload.body] : [];
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        postWithTransfer(fetcherWorker, createRequest(id, "NET_REQUEST", payload), transfer);
      });
    },
  };
};

export { createFetcherClient };
export type { FetcherClient, NetRequestPayload };
