import { FSError } from "../../../kernel/fs/FSError";
import { FsReaderWithReaddir } from "../../../kernel/fs/FsReader";
import {
  CTRL_LENGTH,
  CTRL_STATE,
  FsOp,
  FsResultKind,
  SYNC_STATE_ABANDONED,
  SYNC_STATE_IDLE,
  SYNC_STATE_REQUESTED,
  decodeFsResponse,
  encodeFsRequest,
  getControlView,
  getDataView,
} from "../../../kernel/modules/syncFsWireFormat";

// Kernel-side VFS ops are always fast in-memory lookups, so a timeout firing
// is exceptional — it means the kernel worker never got to service the ping
// (e.g. it's wedged), not that the operation itself is slow.
const REQUEST_TIMEOUT_MS = 5000;

// Guest-side half of the synchronous fs bridge: blocks this worker's thread
// (safe here — a dedicated Worker, never the main thread) until the kernel
// worker answers over the shared buffer. One request in flight at a time,
// which is all a single-threaded guest can ever produce.
export function createSyncFsClient(sab: SharedArrayBuffer): FsReaderWithReaddir {
  const control = getControlView(sab);
  const data = getDataView(sab);

  function request(op: FsOp, path: string) {
    const requestLength = encodeFsRequest(data, { op, path });
    Atomics.store(control, CTRL_LENGTH, requestLength);
    Atomics.store(control, CTRL_STATE, SYNC_STATE_REQUESTED);
    self.postMessage({ type: "sync-fs-ping" });

    const waitResult = Atomics.wait(control, CTRL_STATE, SYNC_STATE_REQUESTED, REQUEST_TIMEOUT_MS);
    if (waitResult === "timed-out") {
      const previous = Atomics.compareExchange(
        control,
        CTRL_STATE,
        SYNC_STATE_REQUESTED,
        SYNC_STATE_ABANDONED,
      );
      if (previous === SYNC_STATE_REQUESTED) {
        throw new Error(`sync fs request timed out: ${FsOp[op]} '${path}'`);
      }
      // The kernel wrote its response right as the timeout fired — fall
      // through and use the real answer instead of discarding it.
    }

    const responseLength = Atomics.load(control, CTRL_LENGTH);
    const response = decodeFsResponse(data, responseLength);
    Atomics.store(control, CTRL_STATE, SYNC_STATE_IDLE);

    if (!response.ok) {
      throw new FSError(response.error.code, response.error.path, response.error.message);
    }
    return response.result;
  }

  return {
    readFile(path: string): Uint8Array {
      const result = request(FsOp.READ_FILE, path);
      if (result.kind !== FsResultKind.BYTES) throw new Error("unexpected sync fs result kind");
      return result.content;
    },
    exists(path: string): boolean {
      const result = request(FsOp.EXISTS, path);
      if (result.kind !== FsResultKind.BOOL) throw new Error("unexpected sync fs result kind");
      return result.value;
    },
    stat(path: string) {
      const result = request(FsOp.STAT, path);
      if (result.kind !== FsResultKind.STAT) throw new Error("unexpected sync fs result kind");
      return result.stat;
    },
    readdir(path: string): string[] {
      const result = request(FsOp.READDIR, path);
      if (result.kind !== FsResultKind.STRING_ARRAY)
        throw new Error("unexpected sync fs result kind");
      return result.entries;
    },
  };
}
