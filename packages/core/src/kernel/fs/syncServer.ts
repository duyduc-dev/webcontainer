import { FSError } from "./FSError";
import {
  decodeFsRequest,
  encodeFsResponse,
  FS_SYNC_LENGTH_INDEX,
  FS_SYNC_STATE_INDEX,
  FS_SYNC_STATE_REQUESTED,
  FS_SYNC_STATE_RESPONDED,
  FsOp,
} from "./syncWireFormat";
import type { FsRequest, FsResponseOk } from "./syncWireFormat";
import type { VirtualFileSystem } from "./VirtualFileSystem";

const executeFsRequest = (vfs: VirtualFileSystem, request: FsRequest): FsResponseOk => {
  switch (request.op) {
    case FsOp.READ_FILE:
      return { ok: true, op: FsOp.READ_FILE, contents: vfs.readFile(request.path) };
    case FsOp.WRITE_FILE:
      vfs.writeFile(request.path, request.contents);
      return { ok: true, op: FsOp.WRITE_FILE };
    case FsOp.MKDIR:
      vfs.mkdir(request.path, { recursive: request.recursive });
      return { ok: true, op: FsOp.MKDIR };
    case FsOp.READDIR:
      return { ok: true, op: FsOp.READDIR, entries: vfs.readdir(request.path) };
    case FsOp.STAT: {
      const stat = vfs.stat(request.path);
      return {
        ok: true,
        op: FsOp.STAT,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      };
    }
    case FsOp.RM:
      vfs.rm(request.path, { recursive: request.recursive });
      return { ok: true, op: FsOp.RM };
    case FsOp.RENAME:
      vfs.rename(request.from, request.to);
      return { ok: true, op: FsOp.RENAME };
    case FsOp.EXISTS:
      return { ok: true, op: FsOp.EXISTS, exists: vfs.exists(request.path) };
  }
};

/**
 * Services one pending sync request already sitting in `data`, driven by an ordinary
 * incoming message (not Atomics.wait - only the future blocking client parks; this
 * side just runs the op and flips the control state so the parked client wakes up).
 */
const serviceSyncFsRequest = (vfs: VirtualFileSystem, control: Int32Array, data: ArrayBufferLike): void => {
  if (Atomics.load(control, FS_SYNC_STATE_INDEX) !== FS_SYNC_STATE_REQUESTED) return;

  const request = decodeFsRequest(data);
  let responseLength: number;

  try {
    responseLength = encodeFsResponse(executeFsRequest(vfs, request), data);
  } catch (error) {
    const fsError = error instanceof FSError ? error : new FSError("EINVAL", "", (error as Error).message);
    responseLength = encodeFsResponse(
      { ok: false, code: fsError.code, path: fsError.path, message: fsError.message },
      data,
    );
  }

  Atomics.store(control, FS_SYNC_LENGTH_INDEX, responseLength);
  Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_RESPONDED);
  Atomics.notify(control, FS_SYNC_STATE_INDEX);
};

export { executeFsRequest, serviceSyncFsRequest };
