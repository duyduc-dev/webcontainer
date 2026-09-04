import type { FSErrorCode } from "../kernel/fs/FSError";
import { FSError } from "../kernel/fs/FSError";
import type { FileSystemTree } from "../kernel/fs/mount";
import { DWCError } from "../protocol/errors";

interface MkdirOptions {
  recursive?: boolean;
}

interface RmOptions {
  recursive?: boolean;
}

interface StatResult {
  isFile(): boolean;
  isDirectory(): boolean;
  size: number;
  mtimeMs: number;
}

interface FileSystemAPI {
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  writeFile(path: string, contents: string | Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<StatResult>;
  rm(path: string, options?: RmOptions): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mount(tree: FileSystemTree, basePath?: string): Promise<void>;
}

type Requester = <T = unknown>(type: string, payload?: unknown) => Promise<T>;

const toFSError = (error: unknown): unknown =>
  error instanceof DWCError ? new FSError(error.code as FSErrorCode, "", error.message) : error;

/** Public `dwc.fs` facade - proxies each call to the kernel worker's FS_REQUEST handler. */
const createFileSystemAPI = (request: Requester): FileSystemAPI => {
  const call = async <T>(action: string, payload: Record<string, unknown>): Promise<T> => {
    try {
      return await request<T>("FS_REQUEST", { action, ...payload });
    } catch (error) {
      throw toFSError(error);
    }
  };

  return {
    mkdir: (path, options) => call("mkdir", { path, recursive: options?.recursive }),
    writeFile: (path, contents) => call("writeFile", { path, contents }),
    readFile: (path) => call<Uint8Array>("readFile", { path }),
    readdir: (path) => call<string[]>("readdir", { path }),
    stat: async (path) => {
      const result = await call<{ isFile: boolean; isDirectory: boolean; size: number; mtimeMs: number }>("stat", {
        path,
      });
      return {
        isFile: () => result.isFile,
        isDirectory: () => result.isDirectory,
        size: result.size,
        mtimeMs: result.mtimeMs,
      };
    },
    rm: (path, options) => call("rm", { path, recursive: options?.recursive }),
    rename: (from, to) => call("rename", { from, to }),
    exists: (path) => call<boolean>("exists", { path }),
    mount: (tree, basePath) => call("mount", { tree, basePath }),
  };
};

export { createFileSystemAPI };
export type { FileSystemAPI, MkdirOptions, RmOptions, StatResult };
