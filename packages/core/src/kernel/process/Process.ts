import { KernelBridge } from "../../bridges/kernel/KernelBridge";
import {
  KernelProcessDataMessage,
  KernelProcessExitMessage,
  KernelWTBEventType,
} from "../../models/kernel/KernelWorkerToBridgeModels";

type DataListener = (stream: "stdout" | "stderr", chunk: string) => void;
type ExitListener = (exitCode: number, cwd: string) => void;

export class Process {
  private readonly dataListeners = new Set<DataListener>();
  private readonly exitListeners = new Set<ExitListener>();
  private readonly unsubscribeData: () => void;
  private readonly unsubscribeExit: () => void;

  constructor(
    bridge: KernelBridge,
    readonly processId: string,
  ) {
    this.unsubscribeData = bridge.on(
      KernelWTBEventType.PROCESS_DATA,
      (message) => {
        const data = message as KernelProcessDataMessage;
        if (data.processId !== this.processId) return;
        for (const listener of this.dataListeners)
          listener(data.stream, data.chunk);
      },
    );

    this.unsubscribeExit = bridge.on(
      KernelWTBEventType.PROCESS_EXIT,
      (message) => {
        const exit = message as KernelProcessExitMessage;
        if (exit.processId !== this.processId) return;
        for (const listener of this.exitListeners)
          listener(exit.exitCode, exit.cwd);
        this.unsubscribeData();
        this.unsubscribeExit();
      },
    );
  }

  onData(listener: DataListener): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onExit(listener: ExitListener): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }
}
