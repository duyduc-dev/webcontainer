import type { FSErrorCode } from "./FSError";

/**
 * Binary frame layout for the future SharedArrayBuffer sync fs bridge (Phase 5).
 * The blocking client (Atomics.wait) is built then - this file only defines the
 * shared encode/decode contract, which is pure and fully testable in Node now.
 */

const FS_SYNC_STATE_IDLE = 0;
const FS_SYNC_STATE_REQUESTED = 1;
const FS_SYNC_STATE_RESPONDED = 2;
const FS_SYNC_STATE_ABANDONED = 3;

/** Control buffer layout: [state, byteLength]. */
const FS_SYNC_STATE_INDEX = 0;
const FS_SYNC_LENGTH_INDEX = 1;
const FS_SYNC_CONTROL_LENGTH = 2;

enum FsOp {
  READ_FILE = 1,
  WRITE_FILE = 2,
  MKDIR = 3,
  READDIR = 4,
  STAT = 5,
  RM = 6,
  RENAME = 7,
  EXISTS = 8,
}

type FsRequest =
  | { op: FsOp.READ_FILE; path: string }
  | { op: FsOp.WRITE_FILE; path: string; contents: Uint8Array }
  | { op: FsOp.MKDIR; path: string; recursive: boolean }
  | { op: FsOp.READDIR; path: string }
  | { op: FsOp.STAT; path: string }
  | { op: FsOp.RM; path: string; recursive: boolean }
  | { op: FsOp.RENAME; from: string; to: string }
  | { op: FsOp.EXISTS; path: string };

type FsResponseOk =
  | { ok: true; op: FsOp.READ_FILE; contents: Uint8Array }
  | { ok: true; op: FsOp.WRITE_FILE }
  | { ok: true; op: FsOp.MKDIR }
  | { ok: true; op: FsOp.READDIR; entries: string[] }
  | { ok: true; op: FsOp.STAT; isFile: boolean; isDirectory: boolean; size: number; mtimeMs: number }
  | { ok: true; op: FsOp.RM }
  | { ok: true; op: FsOp.RENAME }
  | { ok: true; op: FsOp.EXISTS; exists: boolean };

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
      writer.writeString(request.path);
      break;
    case FsOp.WRITE_FILE:
      writer.writeString(request.path);
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
      return { op, path: reader.readString() };
    case FsOp.WRITE_FILE:
      return { op, path: reader.readString(), contents: reader.readBytes() };
    case FsOp.MKDIR:
    case FsOp.RM:
      return { op, path: reader.readString(), recursive: reader.readUint8() === 1 };
    case FsOp.RENAME:
      return { op, from: reader.readString(), to: reader.readString() };
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
      writer.writeBytes(response.contents);
      break;
    case FsOp.READDIR:
      writer.writeUint32(response.entries.length);
      for (const entry of response.entries) writer.writeString(entry);
      break;
    case FsOp.STAT:
      writer.writeUint8(response.isFile ? 1 : 0);
      writer.writeUint8(response.isDirectory ? 1 : 0);
      writer.writeFloat64(response.size);
      writer.writeFloat64(response.mtimeMs);
      break;
    case FsOp.EXISTS:
      writer.writeUint8(response.exists ? 1 : 0);
      break;
    case FsOp.WRITE_FILE:
    case FsOp.MKDIR:
    case FsOp.RM:
    case FsOp.RENAME:
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
      return { ok: true, op, contents: reader.readBytes() };
    case FsOp.READDIR: {
      const count = reader.readUint32();
      const entries: string[] = [];
      for (let i = 0; i < count; i++) entries.push(reader.readString());
      return { ok: true, op, entries };
    }
    case FsOp.STAT:
      return {
        ok: true,
        op,
        isFile: reader.readUint8() === 1,
        isDirectory: reader.readUint8() === 1,
        size: reader.readFloat64(),
        mtimeMs: reader.readFloat64(),
      };
    case FsOp.EXISTS:
      return { ok: true, op, exists: reader.readUint8() === 1 };
    case FsOp.WRITE_FILE:
    case FsOp.MKDIR:
    case FsOp.RM:
    case FsOp.RENAME:
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
  FS_SYNC_CONTROL_LENGTH,
  FS_SYNC_LENGTH_INDEX,
  FS_SYNC_STATE_ABANDONED,
  FS_SYNC_STATE_IDLE,
  FS_SYNC_STATE_INDEX,
  FS_SYNC_STATE_REQUESTED,
  FS_SYNC_STATE_RESPONDED,
  FsOp,
};
export type { FsRequest, FsResponse, FsResponseError, FsResponseOk };
