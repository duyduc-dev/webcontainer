import { createDiagnostics } from "../protocol/diagnostics";
import type { Diagnostics } from "../protocol/diagnostics";
import { DWCError, ERR_BOOT_TIMEOUT, ERR_WORKER } from "../protocol/errors";
import { createRequest, isEvent, isReply } from "../protocol/envelope";
import type { EventEnvelope, ReplyEnvelope } from "../protocol/envelope";
import { postWithTransfer } from "../protocol/transfer";
import { registerKernelWorker } from "./service";

type Unsubscribe = () => void;
type Handler = (payload?: any) => void;

interface KernelBridgeOptions {
  bootTimeoutMs?: number;
}

interface KernelBridge {
  diagnostics: Diagnostics;
  request<T = any>(type: string, payload?: unknown): Promise<T>;
  on(type: string, handler: Handler): Unsubscribe;
}

const DEFAULT_BOOT_TIMEOUT_MS = 10_000;

const createKernelBridge = async (options: KernelBridgeOptions = {}): Promise<KernelBridge> => {
  const diagnostics = createDiagnostics();
  const listeners = new Map<string, Set<Handler>>();
  const pending = new Map<string, { resolve: (value: any) => void; reject: (reason: unknown) => void }>();

  let kernelWorker: Worker;
  try {
    kernelWorker = registerKernelWorker({ name: "KernelWorker" });
  } catch (cause) {
    throw new DWCError(ERR_WORKER, `Failed to create kernel worker: ${(cause as Error).message}`);
  }

  kernelWorker.onmessage = (event: MessageEvent<ReplyEnvelope | EventEnvelope>) => {
    const data = event.data;

    if (isReply(data)) {
      const waiting = pending.get(data.id);
      if (!waiting) return;
      pending.delete(data.id);

      if (data.ok) {
        diagnostics.log("reply", data);
        waiting.resolve(data.result);
      } else {
        diagnostics.log("reply-error", data);
        waiting.reject(new DWCError(data.error.code, data.error.message));
      }
      return;
    }

    if (isEvent(data)) {
      diagnostics.log(data.type, data.payload);
      listeners.get(data.type)?.forEach((handler) => handler(data.payload));
    }
  };

  kernelWorker.onerror = (event: ErrorEvent) => {
    diagnostics.log("worker-error", { message: event.message });
  };

  const request = <T = any>(type: string, payload?: unknown): Promise<T> => {
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      postWithTransfer(kernelWorker, createRequest(id, type, payload));
    });
  };

  const on = (type: string, handler: Handler): Unsubscribe => {
    let handlers = listeners.get(type);
    if (!handlers) listeners.set(type, (handlers = new Set()));
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  };

  const bootTimeoutMs = options.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS;
  await Promise.race([
    request("PING"),
    new Promise((_resolve, reject) => {
      setTimeout(
        () => reject(new DWCError(ERR_BOOT_TIMEOUT, `Kernel worker did not respond within ${bootTimeoutMs}ms`)),
        bootTimeoutMs,
      );
    }),
  ]);

  return { diagnostics, request, on };
};

export { createKernelBridge };
export type { KernelBridge, KernelBridgeOptions };
