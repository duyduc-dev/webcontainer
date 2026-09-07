import type { FSErrorCode } from "./FSError";

/** Binary frame layout for the SharedArrayBuffer sync fs bridge (client added in Phase 5). */

const FS_SYNC_STATE_IDLE = 0;
const FS_SYNC_STATE_REQUESTED = 1;
const FS_SYNC_STATE_RESPONDED = 2;
const FS_SYNC_STATE_ABANDONED = 3;

/** Control buffer layout: [state, byteLength]. */
const FS_SYNC_STATE_INDEX = 0;
const FS_SYNC_LENGTH_INDEX = 1;
const FS_SYNC_CONTROL_LENGTH = 2;

/** Default data buffer size (bytes) for one sync fs channel. */
const FS_SYNC_DATA_BUFFER_SIZE = 1024 * 1024;

/** Max payload bytes per WRITE_FILE/READ_FILE(_CHUNK) frame - the data buffer
 * minus headroom for the op byte, path string, and length prefixes. Real npm
 * packages/registry metadata routinely exceed one buffer's worth (e.g. a
 * popular package's abbreviated packument alone can be several MB) - a
 * request/response whose payload doesn't fit is split across multiple
 * round-trips using WRITE_FILE's `more` flag and the READ_CHUNK op, fully
 * transparent to callers of readFileSync/writeFileSync (see syncFsClient.ts). */
const FS_SYNC_CHUNK_SIZE = FS_SYNC_DATA_BUFFER_SIZE - 4096;

enum FsOp {
  READ_FILE = 1,
  WRITE_FILE = 2,
  MKDIR = 3,
  READDIR = 4,
  STAT = 5,
  RM = 6,
  RENAME = 7,
  EXISTS = 8,
  SYMLINK = 9,
  READLINK = 10,
  LSTAT = 11,
  CHMOD = 12,
  REALPATH = 13,
  /** Continuation request: "give me the next chunk of the READ_FILE already
   * in progress on this channel." No arguments - the server remembers what's
   * being read (only one request is ever in flight per channel, since the
   * client blocks on Atomics.wait between round-trips). */
  READ_CHUNK = 14,
}

type FsRequest =
  | { op: FsOp.READ_FILE; path: string }
  // `more: true` means "more chunks for this write are coming" - the server
  // accumulates rather than committing to the VFS until a chunk without it.
  | { op: FsOp.WRITE_FILE; path: string; contents: Uint8Array; more?: boolean }
  | { op: FsOp.MKDIR; path: string; recursive: boolean }
  | { op: FsOp.READDIR; path: string }
  | { op: FsOp.STAT; path: string }
  | { op: FsOp.RM; path: string; recursive: boolean }
  | { op: FsOp.RENAME; from: string; to: string }
  | { op: FsOp.EXISTS; path: string }
  | { op: FsOp.SYMLINK; target: string; path: string }
  | { op: FsOp.READLINK; path: string }
  | { op: FsOp.LSTAT; path: string }
  | { op: FsOp.CHMOD; path: string; mode: number }
  | { op: FsOp.REALPATH; path: string }
  | { op: FsOp.READ_CHUNK };

type FsResponseOk =
  // `more: true` means the file is bigger than fit in this frame - the
  // client must keep issuing READ_CHUNK requests until it sees `more: false`.
  | { ok: true; op: FsOp.READ_FILE; contents: Uint8Array; more: boolean }
  | { ok: true; op: FsOp.READ_CHUNK; contents: Uint8Array; more: boolean }
  | { ok: true; op: FsOp.WRITE_FILE }
  | { ok: true; op: FsOp.MKDIR }
  | { ok: true; op: FsOp.READDIR; entries: string[] }
  | {
      ok: true;
      op: FsOp.STAT | FsOp.LSTAT;
      isFile: boolean;
      isDirectory: boolean;
      isSymbolicLink: boolean;
      size: number;
      mode: number;
      mtimeMs: number;
    }
  | { ok: true; op: FsOp.RM }
  | { ok: true; op: FsOp.RENAME }
  | { ok: true; op: FsOp.EXISTS; exists: boolean }
  | { ok: true; op: FsOp.SYMLINK }
  | { ok: true; op: FsOp.READLINK; target: string }
  | { ok: true; op: FsOp.CHMOD }
  | { ok: true; op: FsOp.REALPATH; path: string };

type FsResponseError = { ok: false; code: FSErrorCode; path: string; message: string };

type FsResponse = FsResponseOk | FsResponseError;

class BufferWriter {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private offset: number;

  constructor(buffer: ArrayBufferLike, byteOffset = 0) {
    this.bytes = new Uint8Array(buffer, byteOffset);
    this.view = new DataView(buffer, byteOffset);
    this.offset = 0;
  }

  writeUint8(value: number): void {
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  writeUint32(value: number): void {
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  writeFloat64(value: number): void {
    this.view.setFloat64(this.offset, value, true);
    this.offset += 8;
  }

  writeBytes(bytes: Uint8Array): void {
    this.writeUint32(bytes.byteLength);
    this.bytes.set(bytes, this.offset);
    this.offset += bytes.byteLength;
  }

  writeString(value: string): void {
    this.writeBytes(new TextEncoder().encode(value));
  }

  get bytesWritten(): number {
    return this.offset;
  }
}

class BufferReader {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private offset: number;

  constructor(buffer: ArrayBufferLike, byteOffset = 0) {
    this.bytes = new Uint8Array(buffer, byteOffset);
    this.view = new DataView(buffer, byteOffset);
    this.offset = 0;
  }

  readUint8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat64(): number {
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readBytes(): Uint8Array {
    const length = this.readUint32();
    const slice = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  readString(): string {
    return new TextDecoder().decode(this.readBytes());
  }
}

const encodeFsRequest = (request: FsRequest, buffer: ArrayBufferLike, byteOffset = 0): number => {
  const writer = new BufferWriter(buffer, byteOffset);
  writer.writeUint8(request.op);

  switch (request.op) {
    case FsOp.READ_FILE:
    case FsOp.READDIR:
    case FsOp.STAT:
    case FsOp.EXISTS:
    case FsOp.READLINK:
    case FsOp.LSTAT:
    case FsOp.REALPATH:
      writer.writeString(request.path);
      break;
    case FsOp.WRITE_FILE:
      writer.writeString(request.path);
      writer.writeUint8(request.more ? 1 : 0);
      writer.writeBytes(request.contents);
      break;
    case FsOp.MKDIR:
    case FsOp.RM:
      writer.writeString(request.path);
      writer.writeUint8(request.recursive ? 1 : 0);
      break;
    case FsOp.RENAME:
      writer.writeString(request.from);
      writer.writeString(request.to);
      break;
    case FsOp.SYMLINK:
      writer.writeString(request.target);
      writer.writeString(request.path);
      break;
    case FsOp.CHMOD:
      writer.writeString(request.path);
      writer.writeUint32(request.mode);
      break;
    case FsOp.READ_CHUNK:
      break;
  }

  return writer.bytesWritten;
};

const decodeFsRequest = (buffer: ArrayBufferLike, byteOffset = 0): FsRequest => {
  const reader = new BufferReader(buffer, byteOffset);
  const op = reader.readUint8() as FsOp;

  switch (op) {
    case FsOp.READ_FILE:
    case FsOp.READDIR:
    case FsOp.STAT:
    case FsOp.EXISTS:
    case FsOp.READLINK:
    case FsOp.LSTAT:
    case FsOp.REALPATH:
      return { op, path: reader.readString() };
    case FsOp.WRITE_FILE: {
      const path = reader.readString();
      const more = reader.readUint8() === 1;
      return { op, path, more, contents: reader.readBytes() };
    }
    case FsOp.MKDIR:
    case FsOp.RM:
      return { op, path: reader.readString(), recursive: reader.readUint8() === 1 };
    case FsOp.RENAME:
      return { op, from: reader.readString(), to: reader.readString() };
    case FsOp.SYMLINK:
      return { op, target: reader.readString(), path: reader.readString() };
    case FsOp.CHMOD:
      return { op, path: reader.readString(), mode: reader.readUint32() };
    case FsOp.READ_CHUNK:
      return { op };
    default:
      throw new Error(`Unknown FsOp: ${op}`);
  }
};

const encodeFsResponse = (response: FsResponse, buffer: ArrayBufferLike, byteOffset = 0): number => {
  const writer = new BufferWriter(buffer, byteOffset);
  writer.writeUint8(response.ok ? 1 : 0);

  if (!response.ok) {
    writer.writeString(response.code);
    writer.writeString(response.path);
    writer.writeString(response.message);
    return writer.bytesWritten;
  }

  writer.writeUint8(response.op);
  switch (response.op) {
    case FsOp.READ_FILE:
    case FsOp.READ_CHUNK:
      writer.writeUint8(response.more ? 1 : 0);
      writer.writeBytes(response.contents);
      break;
    case FsOp.READDIR:
      writer.writeUint32(response.entries.length);
      for (const entry of response.entries) writer.writeString(entry);
      break;
    case FsOp.STAT:
    case FsOp.LSTAT:
      writer.writeUint8(response.isFile ? 1 : 0);
      writer.writeUint8(response.isDirectory ? 1 : 0);
      writer.writeUint8(response.isSymbolicLink ? 1 : 0);
      writer.writeFloat64(response.size);
      writer.writeUint32(response.mode);
      writer.writeFloat64(response.mtimeMs);
      break;
    case FsOp.EXISTS:
      writer.writeUint8(response.exists ? 1 : 0);
      break;
    case FsOp.READLINK:
      writer.writeString(response.target);
      break;
    case FsOp.REALPATH:
      writer.writeString(response.path);
      break;
    case FsOp.WRITE_FILE:
    case FsOp.MKDIR:
    case FsOp.RM:
    case FsOp.RENAME:
    case FsOp.SYMLINK:
    case FsOp.CHMOD:
      break;
  }

  return writer.bytesWritten;
};

const decodeFsResponse = (buffer: ArrayBufferLike, byteOffset = 0): FsResponse => {
  const reader = new BufferReader(buffer, byteOffset);
  const ok = reader.readUint8() === 1;

  if (!ok) {
    return {
      ok: false,
      code: reader.readString() as FSErrorCode,
      path: reader.readString(),
      message: reader.readString(),
    };
  }

  const op = reader.readUint8() as FsOp;
  switch (op) {
    case FsOp.READ_FILE:
    case FsOp.READ_CHUNK: {
      const more = reader.readUint8() === 1;
      return { ok: true, op, contents: reader.readBytes(), more };
    }
    case FsOp.READDIR: {
      const count = reader.readUint32();
      const entries: string[] = [];
      for (let i = 0; i < count; i++) entries.push(reader.readString());
      return { ok: true, op, entries };
    }
    case FsOp.STAT:
    case FsOp.LSTAT:
      return {
        ok: true,
        op,
        isFile: reader.readUint8() === 1,
        isDirectory: reader.readUint8() === 1,
        isSymbolicLink: reader.readUint8() === 1,
        size: reader.readFloat64(),
        mode: reader.readUint32(),
        mtimeMs: reader.readFloat64(),
      };
    case FsOp.EXISTS:
      return { ok: true, op, exists: reader.readUint8() === 1 };
    case FsOp.READLINK:
      return { ok: true, op, target: reader.readString() };
    case FsOp.REALPATH:
      return { ok: true, op, path: reader.readString() };
    case FsOp.WRITE_FILE:
    case FsOp.MKDIR:
    case FsOp.RM:
    case FsOp.RENAME:
    case FsOp.SYMLINK:
    case FsOp.CHMOD:
      return { ok: true, op };
    default:
      throw new Error(`Unknown FsOp: ${op}`);
  }
};

export {
  BufferReader,
  BufferWriter,
  decodeFsRequest,
  decodeFsResponse,
  encodeFsRequest,
  encodeFsResponse,
  FS_SYNC_CHUNK_SIZE,
  FS_SYNC_CONTROL_LENGTH,
  FS_SYNC_DATA_BUFFER_SIZE,
  FS_SYNC_LENGTH_INDEX,
  FS_SYNC_STATE_ABANDONED,
  FS_SYNC_STATE_IDLE,
  FS_SYNC_STATE_INDEX,
  FS_SYNC_STATE_REQUESTED,
  FS_SYNC_STATE_RESPONDED,
  FsOp,
};
export type { FsRequest, FsResponse, FsResponseError, FsResponseOk };
