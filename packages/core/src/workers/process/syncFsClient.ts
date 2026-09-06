import { FSError } from "../../kernel/fs/FSError";
import {
  decodeFsResponse,
  encodeFsRequest,
  FS_SYNC_STATE_IDLE,
  FS_SYNC_STATE_INDEX,
  FS_SYNC_STATE_REQUESTED,
} from "../../kernel/fs/syncWireFormat";
import type { FsRequest, FsResponseOk } from "../../kernel/fs/syncWireFormat";

interface SyncFsChannel {
  port: MessagePort;
  control: Int32Array;
  data: SharedArrayBuffer;
}

const SYNC_TIMEOUT_MS = 5000;

/** Guest-side Atomics.wait client against the Phase 3 wire format - blocks this worker thread. */
const callSyncFs = (channel: SyncFsChannel, request: FsRequest): FsResponseOk => {
  encodeFsRequest(request, channel.data);
  Atomics.store(channel.control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);
  channel.port.postMessage(undefined);

  const result = Atomics.wait(channel.control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED, SYNC_TIMEOUT_MS);

  if (result === "timed-out") {
    Atomics.store(channel.control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_IDLE);
    throw new FSError("EINVAL", "", "Synchronous fs request timed out");
  }

  const response = decodeFsResponse(channel.data);
  Atomics.store(channel.control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_IDLE);

  if (!response.ok) {
    throw new FSError(response.code, response.path, response.message);
  }

  return response;
};

export { callSyncFs };
export type { SyncFsChannel };
