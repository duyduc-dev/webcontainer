import { FSError } from "../../kernel/fs/FSError";
import {
  decodeFsResponse,
  encodeFsRequest,
  FS_SYNC_CHUNK_SIZE,
  FS_SYNC_STATE_IDLE,
  FS_SYNC_STATE_INDEX,
  FS_SYNC_STATE_REQUESTED,
  FsOp,
} from "../../kernel/fs/syncWireFormat";
import type { FsRequest, FsResponseOk } from "../../kernel/fs/syncWireFormat";

interface SyncFsChannel {
  port: MessagePort;
  control: Int32Array;
  data: SharedArrayBuffer;
}

const SYNC_TIMEOUT_MS = 5000;

/** One request/response round-trip, no chunking awareness - the primitive
 * callSyncFs()'s WRITE_FILE/READ_FILE chunking loops below are built on. */
const rawCallSyncFs = (channel: SyncFsChannel, request: FsRequest): FsResponseOk => {
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

/** Guest-side Atomics.wait client against the Phase 3 wire format - blocks
 * this worker thread. Transparently splits a WRITE_FILE whose contents
 * exceed one frame into multiple chunked round-trips, and drains a
 * READ_FILE whose response comes back with `more: true` into further
 * READ_CHUNK round-trips - callers (readFileSync/writeFileSync) see one
 * call in, one fully-assembled result out, exactly as before chunking
 * existed. Real npm packages/registry metadata routinely exceed one
 * FS_SYNC_CHUNK_SIZE frame (e.g. a popular package's abbreviated packument
 * alone can be several MB), so this isn't a rare edge case. */
const callSyncFs = (channel: SyncFsChannel, request: FsRequest): FsResponseOk => {
  if (request.op === FsOp.WRITE_FILE && request.contents.byteLength > FS_SYNC_CHUNK_SIZE) {
    const { path, contents } = request;
    let offset = 0;
    let response: FsResponseOk = { ok: true, op: FsOp.WRITE_FILE };
    while (offset < contents.byteLength) {
      const end = Math.min(offset + FS_SYNC_CHUNK_SIZE, contents.byteLength);
      const more = end < contents.byteLength;
      response = rawCallSyncFs(channel, { op: FsOp.WRITE_FILE, path, contents: contents.subarray(offset, end), more });
      offset = end;
    }
    return response;
  }

  const response = rawCallSyncFs(channel, request);
  if ((response.op === FsOp.READ_FILE || response.op === FsOp.READ_CHUNK) && response.more) {
    const chunks = [response.contents];
    let more = true;
    while (more) {
      const next = rawCallSyncFs(channel, { op: FsOp.READ_CHUNK });
      if (next.op !== FsOp.READ_CHUNK) throw new FSError("EINVAL", "", "Unexpected response op while draining a chunked READ_FILE");
      chunks.push(next.contents);
      more = next.more;
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const contents = new Uint8Array(total);
    let pos = 0;
    for (const chunk of chunks) {
      contents.set(chunk, pos);
      pos += chunk.byteLength;
    }
    return { ok: true, op: FsOp.READ_FILE, contents, more: false };
  }

  return response;
};

export { callSyncFs };
export type { SyncFsChannel };
