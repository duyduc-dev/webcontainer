import { KernelBridge } from "./bridges/kernel/KernelBridge";
import { FileSystem } from "./apis/FileSystem";
import { ShellSession } from "./apis/Shell";
import { UnsubscribeFn } from "./models";
import { KernelWTBEventType } from "./models/kernel/KernelWorkerToBridgeModels";
import { logger } from "./utilities/logger";

type AnyListener = (...args: any[]) => void;

export class DuckWebContainer {
  private readonly kernelBridge;
  private readonly listeners = new Map<string, Set<AnyListener>>();
  readonly fs: FileSystem;
  readonly shell: ShellSession;

  constructor(bridge: KernelBridge) {
    const kernelBridge = bridge;
    this.kernelBridge = kernelBridge;
    this.fs = new FileSystem(kernelBridge);
    this.shell = new ShellSession(kernelBridge, "default");

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
