import { FSErrorCode } from "../fs/FSError";
import { FileStat } from "../fs/VirtualFileSystem";

// Wire protocol for the synchronous guest-worker <-> kernel-worker fs bridge.
// One combined SharedArrayBuffer per guest worker: a small fixed control
// region (Int32Array, read/written via Atomics) followed by a data region
// carrying a hand-rolled binary frame — structured clone isn't available over
// shared memory, so requests/responses are plain length-prefixed bytes.
//
//   byte 0..15   control region — Int32Array(sab, 0, 4)
//     [CTRL_STATE]  0=IDLE 1=REQUESTED 2=RESPONDED 3=ABANDONED
//     [CTRL_LENGTH] byte length of the current frame in the data region
//     [2],[3]       reserved
//   byte 16..capacity+15   data region — Uint8Array(sab, DATA_OFFSET)

export enum FsOp {
  READ_FILE = 1,
  EXISTS = 2,
  STAT = 3,
  READDIR = 4,
}

export const CTRL_STATE = 0;
export const CTRL_LENGTH = 1;
export const CONTROL_INT32_LENGTH = 4;
export const DATA_OFFSET = CONTROL_INT32_LENGTH * 4;

export const SYNC_STATE_IDLE = 0;
export const SYNC_STATE_REQUESTED = 1;
export const SYNC_STATE_RESPONDED = 2;
export const SYNC_STATE_ABANDONED = 3;

export const DEFAULT_DATA_CAPACITY_BYTES = 8 * 1024 * 1024;

export function getControlView(sab: SharedArrayBuffer): Int32Array {
  return new Int32Array(sab, 0, CONTROL_INT32_LENGTH);
}

export function getDataView(sab: SharedArrayBuffer): Uint8Array {
  return new Uint8Array(sab, DATA_OFFSET);
}

export class WireOverflowError extends Error {
  constructor(capacity: number) {
    super(`sync fs wire buffer overflow: exceeds ${capacity} byte capacity`);
    this.name = "WireOverflowError";
  }
}

class BufferWriter {
  private readonly view: DataView;
  private pos = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private ensure(size: number): void {
    if (this.pos + size > this.bytes.byteLength) {
      throw new WireOverflowError(this.bytes.byteLength);
    }
  }

  writeU8(value: number): void {
    this.ensure(1);
    this.view.setUint8(this.pos, value);
    this.pos += 1;
  }

  writeU32(value: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, value, true);
    this.pos += 4;
  }

  writeF64(value: number): void {
    this.ensure(8);
    this.view.setFloat64(this.pos, value, true);
    this.pos += 8;
  }

  writeBytes(data: Uint8Array): void {
    this.writeU32(data.byteLength);
    this.ensure(data.byteLength);
    this.bytes.set(data, this.pos);
    this.pos += data.byteLength;
  }

  writeString(value: string): void {
    this.writeBytes(new TextEncoder().encode(value));
  }

  get length(): number {
    return this.pos;
  }
}

class BufferReader {
  private readonly view: DataView;
  private pos = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  readU8(): number {
    const value = this.view.getUint8(this.pos);
    this.pos += 1;
    return value;
  }

  readU32(): number {
    const value = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return value;
  }

  readF64(): number {
    const value = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return value;
  }

  readBytes(): Uint8Array {
    const length = this.readU32();
    const slice = this.bytes.slice(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  readString(): string {
    return new TextDecoder().decode(this.readBytes());
  }
}

export type FsRequest = { op: FsOp; path: string };

export function encodeFsRequest(buffer: Uint8Array, request: FsRequest): number {
  const writer = new BufferWriter(buffer);
  writer.writeU8(request.op);
  writer.writeString(request.path);
  return writer.length;
}

export function decodeFsRequest(buffer: Uint8Array, length: number): FsRequest {
  const reader = new BufferReader(buffer.subarray(0, length));
  const op = reader.readU8() as FsOp;
  const path = reader.readString();
  return { op, path };
}

export enum FsResultKind {
  BYTES = 1,
  BOOL = 2,
  STAT = 3,
  STRING_ARRAY = 4,
}

export type FsResult =
  | { kind: FsResultKind.BYTES; content: Uint8Array }
  | { kind: FsResultKind.BOOL; value: boolean }
  | { kind: FsResultKind.STAT; stat: FileStat }
  | { kind: FsResultKind.STRING_ARRAY; entries: string[] };

export type FsErrorPayload = { code: FSErrorCode; path: string; message: string };

export type FsResponse = { ok: true; result: FsResult } | { ok: false; error: FsErrorPayload };

export function encodeFsResponseOk(buffer: Uint8Array, result: FsResult): number {
  const writer = new BufferWriter(buffer);
  writer.writeU8(1);
  writer.writeU8(result.kind);
  switch (result.kind) {
    case FsResultKind.BYTES:
      writer.writeBytes(result.content);
      break;
    case FsResultKind.BOOL:
      writer.writeU8(result.value ? 1 : 0);
      break;
    case FsResultKind.STAT:
      writer.writeU8(result.stat.type === "dir" ? 1 : 0);
      writer.writeF64(result.stat.size);
      writer.writeF64(result.stat.mtime);
      break;
    case FsResultKind.STRING_ARRAY:
      writer.writeU32(result.entries.length);
      for (const entry of result.entries) writer.writeString(entry);
      break;
  }
  return writer.length;
}

export function encodeFsResponseError(buffer: Uint8Array, error: FsErrorPayload): number {
  const writer = new BufferWriter(buffer);
  writer.writeU8(0);
  writer.writeString(error.code);
  writer.writeString(error.path);
  writer.writeString(error.message);
  return writer.length;
}

export function decodeFsResponse(buffer: Uint8Array, length: number): FsResponse {
  const reader = new BufferReader(buffer.subarray(0, length));
  const ok = reader.readU8();
  if (ok !== 1) {
    const code = reader.readString() as FSErrorCode;
    const path = reader.readString();
    const message = reader.readString();
    return { ok: false, error: { code, path, message } };
  }

  const kind = reader.readU8() as FsResultKind;
  switch (kind) {
    case FsResultKind.BYTES:
      return { ok: true, result: { kind, content: reader.readBytes() } };
    case FsResultKind.BOOL:
      return { ok: true, result: { kind, value: reader.readU8() === 1 } };
    case FsResultKind.STAT: {
      const type = reader.readU8() === 1 ? "dir" : "file";
      const size = reader.readF64();
      const mtime = reader.readF64();
      return { ok: true, result: { kind, stat: { type, size, mtime } } };
    }
    case FsResultKind.STRING_ARRAY: {
      const count = reader.readU32();
      const entries: string[] = [];
      for (let i = 0; i < count; i++) entries.push(reader.readString());
      return { ok: true, result: { kind, entries } };
    }
    default: {
      const exhaustive: never = kind;
      throw new Error(`unknown FsResultKind: ${exhaustive}`);
    }
  }
}
