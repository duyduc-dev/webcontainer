import { createFileSystemAPI } from "./apis/FileSystem";
import type { FileSystemAPI } from "./apis/FileSystem";
import { createProcessAPI } from "./apis/Process";
import type { ProcessAPI } from "./apis/Process";
import { createShellAPI } from "./apis/Shell";
import type { ShellAPI } from "./apis/Shell";
import { createKernelBridge } from "./bridges";
import type { KernelBridgeOptions } from "./bridges";
import type { Diagnostics } from "./protocol/diagnostics";

type Unsubscribe = () => void;
type Handler = (payload?: any) => void;

interface BootDWCOptions extends KernelBridgeOptions {}

interface BootDWCReturn {
  diagnostics: Diagnostics;
  fs: FileSystemAPI;
  process: ProcessAPI;
  shell: ShellAPI;
  addEventListener(type: string, handler: Handler): Unsubscribe;
}

const bootDWC = async (options: BootDWCOptions = {}): Promise<BootDWCReturn> => {
  const kernelBridge = await createKernelBridge(options);

  return {
    diagnostics: kernelBridge.diagnostics,
    fs: createFileSystemAPI(kernelBridge.request),
    process: createProcessAPI(kernelBridge.request, kernelBridge.on),
    shell: createShellAPI(kernelBridge.request),
    addEventListener: kernelBridge.on,
  };
};

export { bootDWC };
export type { BootDWCOptions, BootDWCReturn };
