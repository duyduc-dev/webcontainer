import { BufferReader, BufferWriter } from "../fs/syncWireFormat";

/** Binary frame layout for the SharedArrayBuffer sync child_process bridge -
 * same Atomics.wait/notify shape as kernel/fs/syncWireFormat.ts's sync fs
 * bridge (reusing its generic BufferReader/BufferWriter directly), but for a
 * single request/response round trip per call rather than a hot, chunked
 * path: `child_process.execFileSync()` is called rarely, and unlike a file
 * read its "response" (a spawned program's collected output) isn't produced
 * until the whole child process has actually finished running - which, for
 * an install-shaped command (this bridge's own traced need: real rolldown's
 * `src/webcontainer-fallback.cjs` does `execFileSync('pnpm', ['i', pkg], ...)`
 * to fetch its WASM binding), can legitimately take minutes, not
 * milliseconds. See syncExecClient.ts's own doc comment for the timeout this
 * implies. */

const SYNC_EXEC_STATE_IDLE = 0;
const SYNC_EXEC_STATE_REQUESTED = 1;
const SYNC_EXEC_STATE_RESPONDED = 2;

/** Control buffer layout: just [state] - unlike the fs bridge's [state,
 * byteLength], nothing here needs an out-of-band length: this format is
 * never chunked (see SYNC_EXEC_DATA_BUFFER_SIZE's own doc comment), so
 * decode always reads exactly what encode wrote, in order. */
const SYNC_EXEC_STATE_INDEX = 0;
const SYNC_EXEC_CONTROL_LENGTH = 1;

/** Deliberately generous and deliberately NOT chunked (unlike the fs
 * bridge's WRITE_FILE/READ_FILE `more` chunking): every real command this
 * bridge exists to run is a one-shot install-style invocation (traced need:
 * `pnpm i <one package>`), whose combined stdout+stderr has stayed at most a
 * few KB in every real install this project has observed live (see
 * PROGRESS.md's npm-install verification runs). A response that doesn't fit
 * throws a clear "offset out of bounds"-shaped error from BufferWriter
 * itself rather than silently truncating - loud and traceable, not chunking
 * infrastructure speculatively built for a case never actually observed.
 */
const SYNC_EXEC_DATA_BUFFER_SIZE = 4 * 1024 * 1024;

interface SyncExecRequest {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

type SyncExecResponse = { ok: true; exitCode: number; output: string } | { ok: false; message: string };

const encodeSyncExecRequest = (request: SyncExecRequest, buffer: ArrayBufferLike, byteOffset = 0): number => {
  const writer = new BufferWriter(buffer, byteOffset);
  writer.writeString(request.command);
  writer.writeUint32(request.args.length);
  for (const arg of request.args) writer.writeString(arg);
  writer.writeString(request.cwd);
  const envEntries = Object.entries(request.env);
  writer.writeUint32(envEntries.length);
  for (const [key, value] of envEntries) {
    writer.writeString(key);
    writer.writeString(value);
  }
  return writer.bytesWritten;
};

const decodeSyncExecRequest = (buffer: ArrayBufferLike, byteOffset = 0): SyncExecRequest => {
  const reader = new BufferReader(buffer, byteOffset);
  const command = reader.readString();
  const argCount = reader.readUint32();
  const args: string[] = [];
  for (let i = 0; i < argCount; i++) args.push(reader.readString());
  const cwd = reader.readString();
  const envCount = reader.readUint32();
  const env: Record<string, string> = {};
  for (let i = 0; i < envCount; i++) {
    const key = reader.readString();
    env[key] = reader.readString();
  }
  return { command, args, cwd, env };
};

const encodeSyncExecResponse = (response: SyncExecResponse, buffer: ArrayBufferLike, byteOffset = 0): number => {
  const writer = new BufferWriter(buffer, byteOffset);
  writer.writeUint8(response.ok ? 1 : 0);
  if (!response.ok) {
    writer.writeString(response.message);
    return writer.bytesWritten;
  }
  writer.writeUint32(response.exitCode);
  writer.writeString(response.output);
  return writer.bytesWritten;
};

const decodeSyncExecResponse = (buffer: ArrayBufferLike, byteOffset = 0): SyncExecResponse => {
  const reader = new BufferReader(buffer, byteOffset);
  const ok = reader.readUint8() === 1;
  if (!ok) return { ok: false, message: reader.readString() };
  return { ok: true, exitCode: reader.readUint32(), output: reader.readString() };
};

export {
  decodeSyncExecRequest,
  decodeSyncExecResponse,
  encodeSyncExecRequest,
  encodeSyncExecResponse,
  SYNC_EXEC_CONTROL_LENGTH,
  SYNC_EXEC_DATA_BUFFER_SIZE,
  SYNC_EXEC_STATE_IDLE,
  SYNC_EXEC_STATE_INDEX,
  SYNC_EXEC_STATE_REQUESTED,
  SYNC_EXEC_STATE_RESPONDED,
};
export type { SyncExecRequest, SyncExecResponse };
