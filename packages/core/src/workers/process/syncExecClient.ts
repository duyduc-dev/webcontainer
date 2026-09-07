import {
  decodeSyncExecResponse,
  encodeSyncExecRequest,
  SYNC_EXEC_STATE_IDLE,
  SYNC_EXEC_STATE_INDEX,
  SYNC_EXEC_STATE_REQUESTED,
} from "../../kernel/childProcess/syncExecWireFormat";
import type { SyncExecRequest, SyncExecResponse } from "../../kernel/childProcess/syncExecWireFormat";

interface SyncExecChannel {
  port: MessagePort;
  control: Int32Array;
  data: SharedArrayBuffer;
}

// Unlike the sync fs bridge's 5s timeout (an in-memory VFS op that's either
// instant or genuinely stuck), this blocks until a REAL spawned program
// actually exits - this bridge's own traced need (real rolldown's
// WebContainer fallback running `pnpm i <one package>`) has taken up to
// ~3 minutes live against the real npm registry in this project's own
// verification runs. 15 minutes gives real generous headroom above that
// without leaving a genuinely hung child spinning forever.
const SYNC_EXEC_TIMEOUT_MS = 15 * 60 * 1000;

/** Guest-side Atomics.wait client against the sync child_process wire format
 * - blocks this worker thread until the kernel has actually run the
 * requested program to completion and written its result back (see
 * processClient.ts's createSyncExecChannelFor). One request, one response,
 * no chunking (see syncExecWireFormat.ts's own doc comment on why). */
const callSyncExec = (channel: SyncExecChannel, request: SyncExecRequest): SyncExecResponse => {
  encodeSyncExecRequest(request, channel.data);
  Atomics.store(channel.control, SYNC_EXEC_STATE_INDEX, SYNC_EXEC_STATE_REQUESTED);
  channel.port.postMessage(undefined);

  const result = Atomics.wait(channel.control, SYNC_EXEC_STATE_INDEX, SYNC_EXEC_STATE_REQUESTED, SYNC_EXEC_TIMEOUT_MS);

  if (result === "timed-out") {
    Atomics.store(channel.control, SYNC_EXEC_STATE_INDEX, SYNC_EXEC_STATE_IDLE);
    return { ok: false, message: "Synchronous child process exec timed out" };
  }

  const response = decodeSyncExecResponse(channel.data);
  Atomics.store(channel.control, SYNC_EXEC_STATE_INDEX, SYNC_EXEC_STATE_IDLE);
  return response;
};

export { callSyncExec };
export type { SyncExecChannel };
