import { KernelBridge } from "./bridges/kernel/KernelBridge";
import { UnsubscribeFn } from "./models";
import { KernelWTBEventType } from "./models/kernel/KernelWorkerToBridgeModels";
import { logger } from "./utilities/logger";

type AnyListener = (...args: any[]) => void;

export class DuckWebContainer {
  private readonly kernelBridge;
  private readonly listeners = new Map<string, Set<AnyListener>>();

  constructor(bridge: KernelBridge) {
    const kernelBridge = bridge;
    this.kernelBridge = kernelBridge;

    kernelBridge.on(KernelWTBEventType.PING, () => {
      logger.info("Connected to Kernel Worker");
    });
  }

  static initialize() {
    const bridge = new KernelBridge();
    return new DuckWebContainer(bridge);
  }

  on(type: string, handler: AnyListener): UnsubscribeFn {
    let handlersSet = this.listeners.get(type);
    if (!handlersSet) {
      handlersSet = new Set();
    }
    handlersSet.add(handler);
    this.listeners.set(type, handlersSet);
    return () => handlersSet.delete(handler);
  }

  off(event: string, listener: AnyListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emitFromBridge(event: string, data: any) {
    const set = this.listeners.get(event);
    if (set) for (const h of set) h(data);
  }
}
