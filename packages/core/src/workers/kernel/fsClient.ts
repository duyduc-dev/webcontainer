import { createRequest, isEvent, isReply } from "../../protocol/envelope";
import type { EventEnvelope, ReplyEnvelope } from "../../protocol/envelope";
import { DWCError, ERR_WORKER } from "../../protocol/errors";
import { postWithTransfer } from "../../protocol/transfer";
import { spawnChildWorker } from "./spawn";

interface SyncChannelPayload {
  port: MessagePort;
  control: SharedArrayBuffer;
  data: SharedArrayBuffer;
}

interface FsClient {
  request<T = unknown>(payload: unknown): Promise<T>;
  /** Fire-and-forget: hands the FS Worker its half of a per-process sync fs channel. */
  attachSyncChannel(payload: SyncChannelPayload): void;
  /** Fires for every unsolicited event the FS Worker posts (currently just
   * "fs-change", see workers/fs/worker.ts's own watch registry) - distinct
   * from request()'s reply-envelope handling above, since an fs.watch()
   * notification isn't a reply to any particular request. Only one handler
   * at a time (kernel/worker.ts's own single top-level subscriber), matching
   * this client's own single-consumer shape elsewhere. */
  onEvent(handler: (event: EventEnvelope) => void): void;
}

/** Lazily spawns the FS Worker on first use and proxies FS_REQUEST envelopes to it. */
const createFsClient = (): FsClient => {
  let worker: Worker | null = null;
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
  let eventHandler: ((event: EventEnvelope) => void) | null = null;

  const ensureWorker = (): Worker => {
    if (worker) return worker;

    const fsWorker = spawnChildWorker(new URL("../fs/worker.js", import.meta.url), { name: "FsWorker" });
    fsWorker.onmessage = (event: MessageEvent<ReplyEnvelope | EventEnvelope>) => {
      const data = event.data;

      if (isEvent(data)) {
        eventHandler?.(data);
        return;
      }
      if (!isReply(data)) return;

      const waiting = pending.get(data.id);
      if (!waiting) return;
      pending.delete(data.id);

      if (data.ok) waiting.resolve(data.result);
      else waiting.reject(new DWCError(data.error.code, data.error.message));
    };

    // Without this, a script-load failure (e.g. a broken build that ships
    // an unresolvable import inside this worker's file) leaves every
    // pending and future request hanging forever instead of surfacing
    // anything - confirmed live via a bundling regression that did exactly
    // this before this handler existed.
    fsWorker.onerror = (event) => {
      const error = new DWCError(ERR_WORKER, `FS Worker failed to load or crashed: ${event.message || "unknown error"}`);
      for (const [id, waiting] of pending) {
        pending.delete(id);
        waiting.reject(error);
      }
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
    attachSyncChannel(payload: SyncChannelPayload): void {
      const fsWorker = ensureWorker();
      postWithTransfer(fsWorker, { type: "ATTACH_SYNC_CHANNEL", payload }, [payload.port]);
    },
    onEvent(handler: (event: EventEnvelope) => void): void {
      eventHandler = handler;
    },
  };
};

export { createFsClient };
export type { FsClient };
