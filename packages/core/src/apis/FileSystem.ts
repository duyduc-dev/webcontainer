import { KernelBridge } from "../bridges/kernel/KernelBridge";
import { KernelBTWEventType } from "../models/kernel/KernelBridgeToWorkerModels";
import { FileStat } from "../kernel/fs/VirtualFileSystem";

export class FileSystem {
  constructor(private readonly bridge: KernelBridge) {}

  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
    return this.bridge.request({
      type: KernelBTWEventType.FS_REQUEST,
      op: "mkdir",
      path,
      recursive: opts?.recursive,
    });
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    const bytes =
      typeof data === "string" ? new TextEncoder().encode(data) : data;
    return this.bridge.request({
      type: KernelBTWEventType.FS_REQUEST,
      op: "writeFile",
      path,
      data: bytes,
    });
  }

  async readFile(path: string, encoding: "utf8"): Promise<string>;
  async readFile(path: string): Promise<Uint8Array>;
  async readFile(
    path: string,
    encoding?: "utf8",
  ): Promise<string | Uint8Array> {
    const bytes = await this.bridge.request<Uint8Array>({
      type: KernelBTWEventType.FS_REQUEST,
      op: "readFile",
      path,
    });
    return encoding === "utf8" ? new TextDecoder().decode(bytes) : bytes;
  }

  readdir(path: string): Promise<string[]> {
    return this.bridge.request({
      type: KernelBTWEventType.FS_REQUEST,
      op: "readdir",
      path,
    });
  }

  stat(path: string): Promise<FileStat> {
    return this.bridge.request({
      type: KernelBTWEventType.FS_REQUEST,
      op: "stat",
      path,
    });
  }

  rm(path: string, opts?: { recursive?: boolean }): Promise<void> {
    return this.bridge.request({
      type: KernelBTWEventType.FS_REQUEST,
      op: "rm",
      path,
      recursive: opts?.recursive,
    });
  }

  rename(from: string, to: string): Promise<void> {
    return this.bridge.request({
      type: KernelBTWEventType.FS_REQUEST,
      op: "rename",
      from,
      to,
    });
  }
}
