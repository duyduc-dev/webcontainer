import { createFileSystemAPI } from "./apis/FileSystem";
import type { FileSystemAPI } from "./apis/FileSystem";
import { createKernelBridge } from "./bridges";
import type { KernelBridgeOptions } from "./bridges";
import type { Diagnostics } from "./protocol/diagnostics";

type Unsubscribe = () => void;
type Handler = (payload?: any) => void;

interface BootDWCOptions extends KernelBridgeOptions {}

interface BootDWCReturn {
  diagnostics: Diagnostics;
  fs: FileSystemAPI;
  addEventListener(type: string, handler: Handler): Unsubscribe;
}

const bootDWC = async (options: BootDWCOptions = {}): Promise<BootDWCReturn> => {
  const kernelBridge = await createKernelBridge(options);

  return {
    diagnostics: kernelBridge.diagnostics,
    fs: createFileSystemAPI(kernelBridge.request),
    addEventListener: kernelBridge.on,
  };
};

export { bootDWC };
export type { BootDWCOptions, BootDWCReturn };
