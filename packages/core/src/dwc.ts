import { KernelBridge } from "./bridges/kernel/KernelBridge";

export class DuckWebContainer {
  private readonly kernelBridge;

  constructor() {
    this.kernelBridge = new KernelBridge();
  }
}
