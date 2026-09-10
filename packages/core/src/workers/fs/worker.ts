import { COREUTILS } from "../../kernel/fs/coreutils";
import { FSError } from "../../kernel/fs/FSError";
import type { FileSystemTree } from "../../kernel/fs/mount";
import { mount } from "../../kernel/fs/mount";
import { normalize } from "../../kernel/fs/path";
import { createSyncFsServerState, serviceSyncFsRequest } from "../../kernel/fs/syncServer";
import { createVirtualFileSystem } from "../../kernel/fs/VirtualFileSystem";
import type { VfsChangeEvent } from "../../kernel/fs/VirtualFileSystem";
import { matchesWatch, watchFilename } from "../../kernel/fs/watchMatch";
import type { RequestEnvelope } from "../../protocol/envelope";
import { ERR_INTERNAL } from "../../protocol/errors";
import { postErrorReply, postEvent, postReply } from "./service";

type FsRequestPayload =
  | { action: "mkdir"; path: string; recursive?: boolean }
  | { action: "writeFile"; path: string; contents: string | Uint8Array }
  | { action: "readFile"; path: string }
  | { action: "readdir"; path: string }
  | { action: "stat"; path: string }
  | { action: "rm"; path: string; recursive?: boolean }
  | { action: "rename"; from: string; to: string }
  | { action: "exists"; path: string }
  | { action: "mount"; tree: FileSystemTree; basePath?: string }
  | { action: "symlink"; target: string; path: string }
  | { action: "readlink"; path: string }
  | { action: "lstat"; path: string }
  | { action: "chmod"; path: string; mode: number }
  | { action: "realpath"; path: string }
  // Real Node's fs.watch(path[, {recursive}], listener) - traced need: real
  // Vite's own dependency-optimizer/config watcher (chokidar's fallback
  // createFsWatchInstance) calls this directly at dev-server startup, and
  // depends on it firing on a real file change for HMR to work at all (see
  // runtime/builtins/fs.ts's own doc comment on watch(), and PROGRESS.md's
  // item 11 for why this was previously a complete no-op). `watchId` is
  // minted by the requesting process worker (workers/process/worker.ts's
  // createFsWatchBridge) so it can be threaded straight back through an
  // unsolicited "fs-change" event with no separate id-allocation round trip.
  // `processId` is who to attribute a later match to - this VFS instance and
  // its watch registry are shared by every process, so "which process asked
  // for this" has to travel with the registration itself.
  | { action: "watch"; watchId: string; path: string; recursive?: boolean; processId: string }
  | { action: "unwatch"; watchId: string }
  // Sweeps every watch a given process registered - traced need: a process
  // that's killed or crashes without ever calling FSWatcher.close() would
  // otherwise leak its registry entries forever (they'd just never match
  // again once the process's own Worker is gone, but they'd sit in this map
  // indefinitely) - called from processClient.ts's own three worker-
  // teardown sites (exit/onerror/kill), mirroring how netRelay.
  // unregisterWorker() already gets called from the exact same three places.
  | { action: "unwatchProcess"; processId: string };

const vfs = createVirtualFileSystem();

// One process-agnostic registry for every active fs.watch() across every
// guest process - this FS Worker is a single, shared instance (see this
// file's own module-level `vfs`), so watch matching only needs to happen
// once per real mutation, not once per process.
const watchRegistry = new Map<string, { path: string; recursive: boolean; processId: string }>();

vfs.onChange(({ eventType, path }: VfsChangeEvent) => {
  for (const [watchId, watch] of watchRegistry) {
    if (!matchesWatch(watch, path)) continue;
    postEvent("fs-change", { processId: watch.processId, watchId, eventType, filename: watchFilename(watch.path, path) });
  }
});

// Every non-cd shell command resolves against /bin (see processClient.ts's
// runShell()), so the coreutils programs must exist before the first
// FS_REQUEST is ever handled — no boot round-trip to wait on. mount() never
// creates its own basePath directory (only nested `directory` entries get
// mkdir'd), so /bin is nested under root here rather than passed as basePath.
const coreutilsTree: FileSystemTree = {
  bin: {
    directory: Object.fromEntries(Object.entries(COREUTILS).map(([name, source]) => [`${name}.js`, { file: { contents: source } }])),
  },
};
mount(vfs, coreutilsTree, "/");

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
      return {
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        isSymbolicLink: stat.isSymbolicLink(),
        size: stat.size,
        mode: stat.mode,
        mtimeMs: stat.mtimeMs,
      };
    }
    case "lstat": {
      const stat = vfs.lstat(payload.path);
      return {
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        isSymbolicLink: stat.isSymbolicLink(),
        size: stat.size,
        mode: stat.mode,
        mtimeMs: stat.mtimeMs,
      };
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
    case "symlink":
      vfs.symlink(payload.target, payload.path);
      return undefined;
    case "readlink":
      return vfs.readlink(payload.path);
    case "chmod":
      vfs.chmod(payload.path, payload.mode);
      return undefined;
    case "realpath":
      return vfs.realpath(payload.path);
    case "watch":
      watchRegistry.set(payload.watchId, { path: normalize(payload.path), recursive: !!payload.recursive, processId: payload.processId });
      return undefined;
    case "unwatch":
      watchRegistry.delete(payload.watchId);
      return undefined;
    case "unwatchProcess":
      for (const [watchId, watch] of watchRegistry) {
        if (watch.processId === payload.processId) watchRegistry.delete(watchId);
      }
      return undefined;
  }
};

interface AttachSyncChannelPayload {
  port: MessagePort;
  control: SharedArrayBuffer;
  data: SharedArrayBuffer;
}

const attachSyncChannel = (payload: AttachSyncChannelPayload): void => {
  const control = new Int32Array(payload.control);
  const state = createSyncFsServerState();
  payload.port.onmessage = () => serviceSyncFsRequest(vfs, state, control, payload.data);
};

type AttachSyncChannelMessage = { type: "ATTACH_SYNC_CHANNEL"; payload: AttachSyncChannelPayload };

self.onmessage = (event: MessageEvent<RequestEnvelope<FsRequestPayload> | AttachSyncChannelMessage>) => {
  const data = event.data;

  if (data.type === "ATTACH_SYNC_CHANNEL") {
    attachSyncChannel((data as AttachSyncChannelMessage).payload);
    return;
  }

  const { id, payload } = data as RequestEnvelope<FsRequestPayload>;
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
