import { FSError } from "../fs/FSError";
import { VirtualFileSystem } from "../fs/VirtualFileSystem";
import {
  CTRL_LENGTH,
  CTRL_STATE,
  DATA_OFFSET,
  DEFAULT_DATA_CAPACITY_BYTES,
  FsOp,
  FsResult,
  FsResultKind,
  SYNC_STATE_IDLE,
  SYNC_STATE_REQUESTED,
  SYNC_STATE_RESPONDED,
  decodeFsRequest,
  encodeFsResponseError,
  encodeFsResponseOk,
  getControlView,
  getDataView,
} from "./syncFsWireFormat";

export function createSyncFsBuffer(
  capacityBytes: number = DEFAULT_DATA_CAPACITY_BYTES,
): SharedArrayBuffer {
  return new SharedArrayBuffer(DATA_OFFSET + capacityBytes);
}

function runOp(vfs: VirtualFileSystem, op: FsOp, path: string): FsResult {
  switch (op) {
    case FsOp.READ_FILE:
      return { kind: FsResultKind.BYTES, content: vfs.readFile(path) };
    case FsOp.EXISTS:
      return { kind: FsResultKind.BOOL, value: vfs.exists(path) };
    case FsOp.STAT:
      return { kind: FsResultKind.STAT, stat: vfs.stat(path) };
    case FsOp.READDIR:
      return { kind: FsResultKind.STRING_ARRAY, entries: vfs.readdir(path) };
    default: {
      const exhaustive: never = op;
      throw new Error(`unknown fs op: ${exhaustive}`);
    }
  }
}

// Runs entirely inside the kernel worker in response to a guest's
// "sync-fs-ping" message — the kernel never blocks (no Atomics.wait/waitAsync
// on this side), it just services the request from its normal event loop
// exactly like it already handles the guest's "data"/"listen"/"exit"
// messages, then wakes the guest's Atomics.wait via Atomics.notify.
export function serviceSyncFsRequest(vfs: VirtualFileSystem, sab: SharedArrayBuffer): void {
  const control = getControlView(sab);
  const data = getDataView(sab);
  const requestLength = Atomics.load(control, CTRL_LENGTH);
  const { op, path } = decodeFsRequest(data, requestLength);

  let responseLength: number;
  try {
    responseLength = encodeFsResponseOk(data, runOp(vfs, op, path));
  } catch (error) {
    // A write that overflows the data region (an oversized file) surfaces
    // here too, since encodeFsResponseOk throws WireOverflowError — folded
    // into the same EFBIG error path rather than handled separately.
    const isOverflow = error instanceof Error && error.name === "WireOverflowError";
    const fsError =
      error instanceof FSError
        ? error
        : new FSError(
            isOverflow ? "EFBIG" : "EINVAL",
            path,
            isOverflow
              ? `file too large for sync fs channel: exceeds ${data.byteLength} byte capacity`
              : String(error),
          );
    responseLength = encodeFsResponseError(data, {
      code: fsError.code,
      path: fsError.path,
      message: fsError.message,
    });
  }

  if (
    Atomics.compareExchange(control, CTRL_STATE, SYNC_STATE_REQUESTED, SYNC_STATE_RESPONDED) !==
    SYNC_STATE_REQUESTED
  ) {
    // Guest already abandoned this request (its wait() timed out and raced
    // us here) — drop the result, leave the channel idle for the next call.
    Atomics.store(control, CTRL_STATE, SYNC_STATE_IDLE);
    return;
  }

  Atomics.store(control, CTRL_LENGTH, responseLength);
  Atomics.notify(control, CTRL_STATE, 1);
}
