import { FSError } from "./FSError";
import {
  decodeFsRequest,
  encodeFsResponse,
  FS_SYNC_CHUNK_SIZE,
  FS_SYNC_LENGTH_INDEX,
  FS_SYNC_STATE_INDEX,
  FS_SYNC_STATE_REQUESTED,
  FS_SYNC_STATE_RESPONDED,
  FsOp,
} from "./syncWireFormat";
import type { FsRequest, FsResponseOk } from "./syncWireFormat";
import type { VirtualFileSystem } from "./VirtualFileSystem";

/** Per-channel state for a WRITE_FILE/READ_FILE that spans multiple
 * round-trips because its payload doesn't fit in one FS_SYNC_CHUNK_SIZE
 * frame. Exactly one request is ever in flight per channel (the client
 * blocks on Atomics.wait between round-trips), so a single mutable slot per
 * channel - not a map - is all the concurrency this needs to account for. */
interface SyncFsServerState {
  pendingWrite: { path: string; chunks: Uint8Array[] } | null;
  pendingRead: { remaining: Uint8Array } | null;
}

const createSyncFsServerState = (): SyncFsServerState => ({ pendingWrite: null, pendingRead: null });

const concatChunks = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

const executeFsRequest = (vfs: VirtualFileSystem, state: SyncFsServerState, request: FsRequest): FsResponseOk => {
  switch (request.op) {
    case FsOp.READ_FILE: {
      const contents = vfs.readFile(request.path);
      if (contents.byteLength <= FS_SYNC_CHUNK_SIZE) {
        return { ok: true, op: FsOp.READ_FILE, contents, more: false };
      }
      state.pendingRead = { remaining: contents.subarray(FS_SYNC_CHUNK_SIZE) };
      return { ok: true, op: FsOp.READ_FILE, contents: contents.subarray(0, FS_SYNC_CHUNK_SIZE), more: true };
    }
    case FsOp.READ_CHUNK: {
      const pending = state.pendingRead;
      if (!pending) throw new FSError("EINVAL", "", "READ_CHUNK with no read in progress on this channel");
      const chunk = pending.remaining.subarray(0, FS_SYNC_CHUNK_SIZE);
      const rest = pending.remaining.subarray(FS_SYNC_CHUNK_SIZE);
      state.pendingRead = rest.byteLength > 0 ? { remaining: rest } : null;
      return { ok: true, op: FsOp.READ_CHUNK, contents: chunk, more: rest.byteLength > 0 };
    }
    case FsOp.WRITE_FILE: {
      if (request.more) {
        const existing = state.pendingWrite;
        const chunks = existing && existing.path === request.path ? existing.chunks : [];
        chunks.push(request.contents);
        state.pendingWrite = { path: request.path, chunks };
        return { ok: true, op: FsOp.WRITE_FILE };
      }
      const pending = state.pendingWrite;
      state.pendingWrite = null;
      const contents =
        pending && pending.path === request.path
          ? concatChunks([...pending.chunks, request.contents])
          : request.contents;
      vfs.writeFile(request.path, contents);
      return { ok: true, op: FsOp.WRITE_FILE };
    }
    case FsOp.MKDIR:
      vfs.mkdir(request.path, { recursive: request.recursive });
      return { ok: true, op: FsOp.MKDIR };
    case FsOp.READDIR:
      return { ok: true, op: FsOp.READDIR, entries: vfs.readdir(request.path) };
    case FsOp.STAT:
    case FsOp.LSTAT: {
      const stat = request.op === FsOp.STAT ? vfs.stat(request.path) : vfs.lstat(request.path);
      return {
        ok: true,
        op: request.op,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        isSymbolicLink: stat.isSymbolicLink(),
        size: stat.size,
        mode: stat.mode,
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
    case FsOp.SYMLINK:
      vfs.symlink(request.target, request.path);
      return { ok: true, op: FsOp.SYMLINK };
    case FsOp.READLINK:
      return { ok: true, op: FsOp.READLINK, target: vfs.readlink(request.path) };
    case FsOp.CHMOD:
      vfs.chmod(request.path, request.mode);
      return { ok: true, op: FsOp.CHMOD };
    case FsOp.UTIMES:
      vfs.utimes(request.path, request.mtimeMs);
      return { ok: true, op: FsOp.UTIMES };
    case FsOp.REALPATH:
      return { ok: true, op: FsOp.REALPATH, path: vfs.realpath(request.path) };
  }
};

/**
 * Services one pending sync request already sitting in `data`, driven by an ordinary
 * incoming message (not Atomics.wait - only the future blocking client parks; this
 * side just runs the op and flips the control state so the parked client wakes up).
 *
 * `state` is one channel's chunked-transfer state (see SyncFsServerState) -
 * callers create one with createSyncFsServerState() and reuse it across every
 * call for that channel, matching one state slot per guest process. Any
 * error clears it, so a failed chunk never corrupts a later, unrelated call.
 */
const serviceSyncFsRequest = (vfs: VirtualFileSystem, state: SyncFsServerState, control: Int32Array, data: ArrayBufferLike): void => {
  if (Atomics.load(control, FS_SYNC_STATE_INDEX) !== FS_SYNC_STATE_REQUESTED) return;

  const request = decodeFsRequest(data);
  let responseLength: number;

  try {
    responseLength = encodeFsResponse(executeFsRequest(vfs, state, request), data);
  } catch (error) {
    state.pendingWrite = null;
    state.pendingRead = null;
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

export { createSyncFsServerState, executeFsRequest, serviceSyncFsRequest };
export type { SyncFsServerState };
