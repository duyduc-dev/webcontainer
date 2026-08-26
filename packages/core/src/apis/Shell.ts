import { KernelBridge } from "../bridges/kernel/KernelBridge";
import { KernelBTWEventType } from "../models/kernel/KernelBridgeToWorkerModels";
import { ShellExecResult } from "../kernel/shell/Shell";
import { Process } from "../kernel/process/Process";

export class ShellSession {
  constructor(
    private readonly bridge: KernelBridge,
    private readonly shellId: string,
  ) {}

  exec(line: string): Promise<ShellExecResult> {
    return this.bridge.request({
      type: KernelBTWEventType.SHELL_REQUEST,
      op: "shellExec",
      shellId: this.shellId,
      line,
    });
  }

  async spawn(line: string): Promise<Process> {
    const { processId } = await this.bridge.request<{ processId: string }>({
      type: KernelBTWEventType.PROCESS_SPAWN,
      op: "processSpawn",
      shellId: this.shellId,
      line,
    });
    return new Process(this.bridge, processId);
  }
}
