import { FSError } from "../../kernel/fs/FSError";
import type { FileSystemTree } from "../../kernel/fs/mount";
import { mount } from "../../kernel/fs/mount";
import { createVirtualFileSystem } from "../../kernel/fs/VirtualFileSystem";
import type { RequestEnvelope } from "../../protocol/envelope";
import { ERR_INTERNAL } from "../../protocol/errors";
import { postErrorReply, postReply } from "./service";

type FsRequestPayload =
  | { action: "mkdir"; path: string; recursive?: boolean }
  | { action: "writeFile"; path: string; contents: string | Uint8Array }
  | { action: "readFile"; path: string }
  | { action: "readdir"; path: string }
  | { action: "stat"; path: string }
  | { action: "rm"; path: string; recursive?: boolean }
  | { action: "rename"; from: string; to: string }
  | { action: "exists"; path: string }
  | { action: "mount"; tree: FileSystemTree; basePath?: string };

const vfs = createVirtualFileSystem();

const handleFsRequest = (payload: FsRequestPayload): unknown => {
  switch (payload.action) {
    case "mkdir":
      vfs.mkdir(payload.path, { recursive: payload.recursive });
      return undefined;
    case "writeFile":
      vfs.writeFile(payload.path, payload.contents);
      return undefined;
    case "readFile":
      return vfs.readFile(payload.path);
    case "readdir":
      return vfs.readdir(payload.path);
    case "stat": {
      const stat = vfs.stat(payload.path);
      return { isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size, mtimeMs: stat.mtimeMs };
    }
    case "rm":
      vfs.rm(payload.path, { recursive: payload.recursive });
      return undefined;
    case "rename":
      vfs.rename(payload.from, payload.to);
      return undefined;
    case "exists":
      return vfs.exists(payload.path);
    case "mount":
      mount(vfs, payload.tree, payload.basePath ?? "/");
      return undefined;
  }
};

self.onmessage = (event: MessageEvent<RequestEnvelope<FsRequestPayload>>) => {
  const { id, payload } = event.data;

  try {
    postReply(id, handleFsRequest(payload as FsRequestPayload));
  } catch (error) {
    if (error instanceof FSError) {
      postErrorReply(id, error.code, error.message);
      return;
    }
    postErrorReply(id, ERR_INTERNAL, error instanceof Error ? error.message : String(error));
  }
};
