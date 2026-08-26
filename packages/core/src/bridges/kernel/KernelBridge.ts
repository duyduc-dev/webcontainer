import { UnsubscribeFn } from "../../models";
import {
  KernelWTBEventHandler,
  KernelWTBEventMessage,
  KernelWTBEventType,
} from "../../models/kernel/KernelWorkerToBridgeModels";

export class KernelBridge {
  private readonly worker: Worker;
  private readonly handlers = new Map<
    KernelWTBEventType,
    Set<KernelWTBEventHandler>
  >();

  constructor() {
    this.worker = new Worker(new URL("./workers/kernel/KernelWorker.ts"), {
      type: "module",
      name: "KernelWorker",
    });

    this.worker.onmessage = (event: MessageEvent<KernelWTBEventMessage>) => {
      const data = event.data;
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

  private emitFromWorkerToBridge(type: KernelWTBEventType, data: KernelWTBEventMessage) {
    const set = this.handlers.get(type);
    if (set) for (const h of set) h(data);
  }
}
