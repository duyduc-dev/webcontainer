import { UnsubscribeFn } from "../../models";
import {
  KernelBTWEventMessage,
  KernelRequestPayload,
} from "../../models/kernel/KernelBridgeToWorkerModels";
import {
  KernelWTBEventHandler,
  KernelWTBEventMessage,
  KernelWTBEventType,
} from "../../models/kernel/KernelWorkerToBridgeModels";
import { FSError, FSErrorCode } from "../../kernel/fs/FSError";

export class KernelBridge {
  private readonly worker: Worker;
  private readonly handlers = new Map<
    KernelWTBEventType,
    Set<KernelWTBEventHandler>
  >();
  private readonly pending = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason: any) => void }
  >();

  constructor() {
    this.worker = new Worker(
      new URL("./workers/kernel/KernelWorker.js", import.meta.url),
      {
        type: "module",
        name: "KernelWorker",
      },
    );

    this.worker.onmessage = (event: MessageEvent<KernelWTBEventMessage>) => {
      const data = event.data;

      if ("requestId" in data) {
        const pending = this.pending.get(data.requestId);
        if (!pending) return;
        this.pending.delete(data.requestId);

        if (data.ok) {
          pending.resolve(data.result);
        } else {
          pending.reject(
            new FSError(
              data.error.code as FSErrorCode,
              data.error.path,
              data.error.message,
            ),
          );
        }
        return;
      }

      this.emitFromWorkerToBridge(data.type, data);
    };
  }

  on(type: KernelWTBEventType, handler: KernelWTBEventHandler): UnsubscribeFn {
    let handlersSet = this.handlers.get(type);
    if (!handlersSet) {
      handlersSet = new Set();
    }
    handlersSet.add(handler);
    this.handlers.set(type, handlersSet);
    return () => handlersSet.delete(handler);
  }

  request<T>(payload: KernelRequestPayload): Promise<T> {
    const requestId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      const message = { ...payload, requestId } as KernelBTWEventMessage;
      this.worker.postMessage(message);
    });
  }

  private emitFromWorkerToBridge(
    type: KernelWTBEventType,
    data: KernelWTBEventMessage,
  ) {
    const set = this.handlers.get(type);
    if (set) for (const h of set) h(data);
  }
}
