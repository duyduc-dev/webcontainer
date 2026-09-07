import { describe, expect, it } from "vitest";
import { createVirtualFileSystem } from "./VirtualFileSystem";
import { createSyncFsServerState, serviceSyncFsRequest } from "./syncServer";
import {
  decodeFsResponse,
  encodeFsRequest,
  FS_SYNC_CHUNK_SIZE,
  FS_SYNC_DATA_BUFFER_SIZE,
  FS_SYNC_STATE_INDEX,
  FS_SYNC_STATE_REQUESTED,
  FsOp,
} from "./syncWireFormat";

const DATA_SIZE = 4096;

const makeChannel = (dataSize = DATA_SIZE) => {
  const control = new Int32Array(new SharedArrayBuffer(8));
  const data = new SharedArrayBuffer(dataSize);
  return { control, data };
};

const send = (vfs: ReturnType<typeof createVirtualFileSystem>, state: ReturnType<typeof createSyncFsServerState>, control: Int32Array, data: SharedArrayBuffer, request: Parameters<typeof encodeFsRequest>[0]) => {
  encodeFsRequest(request, data);
  Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);
  serviceSyncFsRequest(vfs, state, control, data);
  return decodeFsResponse(data);
};

describe("serviceSyncFsRequest", () => {
  it("ignores the buffer when the control state is not REQUESTED", () => {
    const vfs = createVirtualFileSystem();
    const { control, data } = makeChannel();

    serviceSyncFsRequest(vfs, createSyncFsServerState(), control, data);

    expect(Atomics.load(control, FS_SYNC_STATE_INDEX)).toBe(0);
  });

  it("services a READ_FILE request and flips control state to RESPONDED", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/a.txt", "hello");
    const { control, data } = makeChannel();

    encodeFsRequest({ op: FsOp.READ_FILE, path: "/a.txt" }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);

    serviceSyncFsRequest(vfs, createSyncFsServerState(), control, data);

    expect(Atomics.load(control, FS_SYNC_STATE_INDEX)).toBe(2);
    const response = decodeFsResponse(data);
    expect(response.ok).toBe(true);
    if (response.ok && response.op === FsOp.READ_FILE) {
      expect(new TextDecoder().decode(response.contents)).toBe("hello");
    } else {
      throw new Error("expected a READ_FILE success response");
    }
  });

  it("encodes a VFS error as a failure response instead of throwing", () => {
    const vfs = createVirtualFileSystem();
    const { control, data } = makeChannel();

    encodeFsRequest({ op: FsOp.READ_FILE, path: "/missing" }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);

    expect(() => serviceSyncFsRequest(vfs, createSyncFsServerState(), control, data)).not.toThrow();

    const response = decodeFsResponse(data);
    expect(response).toMatchObject({ ok: false, code: "ENOENT", path: "/missing" });
  });

  it("services a WRITE_FILE request and the write is visible on the VFS", () => {
    const vfs = createVirtualFileSystem();
    const { control, data } = makeChannel();

    encodeFsRequest({ op: FsOp.WRITE_FILE, path: "/out.txt", contents: new TextEncoder().encode("hi") }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);

    serviceSyncFsRequest(vfs, createSyncFsServerState(), control, data);

    expect(new TextDecoder().decode(vfs.readFile("/out.txt"))).toBe("hi");
  });

  it("services a SYMLINK request, then LSTAT reports it as a link and STAT follows it", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/real.txt", "hi");
    const { control, data } = makeChannel();

    encodeFsRequest({ op: FsOp.SYMLINK, target: "/real.txt", path: "/link.txt" }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);
    serviceSyncFsRequest(vfs, createSyncFsServerState(), control, data);
    expect(decodeFsResponse(data)).toEqual({ ok: true, op: FsOp.SYMLINK });

    encodeFsRequest({ op: FsOp.LSTAT, path: "/link.txt" }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);
    serviceSyncFsRequest(vfs, createSyncFsServerState(), control, data);
    const lstat = decodeFsResponse(data);
    expect(lstat).toMatchObject({ ok: true, op: FsOp.LSTAT, isSymbolicLink: true, isFile: false });

    encodeFsRequest({ op: FsOp.STAT, path: "/link.txt" }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);
    serviceSyncFsRequest(vfs, createSyncFsServerState(), control, data);
    const stat = decodeFsResponse(data);
    expect(stat).toMatchObject({ ok: true, op: FsOp.STAT, isSymbolicLink: false, isFile: true });
  });

  it("services a READLINK request", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/a");
    vfs.symlink("../real.txt", "/a/link.txt");
    const { control, data } = makeChannel();

    encodeFsRequest({ op: FsOp.READLINK, path: "/a/link.txt" }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);
    serviceSyncFsRequest(vfs, createSyncFsServerState(), control, data);

    expect(decodeFsResponse(data)).toEqual({ ok: true, op: FsOp.READLINK, target: "../real.txt" });
  });

  it("services a REALPATH request", () => {
    const vfs = createVirtualFileSystem();
    vfs.mkdir("/a");
    vfs.writeFile("/real.txt", "hi");
    vfs.symlink("../real.txt", "/a/link.txt");
    const { control, data } = makeChannel();

    encodeFsRequest({ op: FsOp.REALPATH, path: "/a/link.txt" }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);
    serviceSyncFsRequest(vfs, createSyncFsServerState(), control, data);

    expect(decodeFsResponse(data)).toEqual({ ok: true, op: FsOp.REALPATH, path: "/real.txt" });
  });

  it("chunked WRITE_FILE: accumulates `more` chunks and only commits to the VFS on the final one", () => {
    const vfs = createVirtualFileSystem();
    const { control, data } = makeChannel();
    const state = createSyncFsServerState();

    const first = send(vfs, state, control, data, { op: FsOp.WRITE_FILE, path: "/big.txt", contents: new TextEncoder().encode("hello "), more: true });
    expect(first).toEqual({ ok: true, op: FsOp.WRITE_FILE });
    // Not committed yet - a fresh channel (fresh state) reading the same path sees nothing.
    expect(vfs.exists("/big.txt")).toBe(false);

    const second = send(vfs, state, control, data, { op: FsOp.WRITE_FILE, path: "/big.txt", contents: new TextEncoder().encode("world"), more: false });
    expect(second).toEqual({ ok: true, op: FsOp.WRITE_FILE });
    expect(new TextDecoder().decode(vfs.readFile("/big.txt"))).toBe("hello world");
  });

  it("chunked READ_FILE: a file bigger than one frame comes back with more:true, and READ_CHUNK drains the rest", () => {
    const vfs = createVirtualFileSystem();
    // One byte over the chunk boundary, so the first frame is exactly full and exactly one byte remains.
    const contents = new Uint8Array(FS_SYNC_CHUNK_SIZE + 1);
    contents.fill(7);
    contents[contents.byteLength - 1] = 42;
    vfs.writeFile("/big.bin", contents);

    const { control, data } = makeChannel(FS_SYNC_DATA_BUFFER_SIZE);
    const state = createSyncFsServerState();

    const first = send(vfs, state, control, data, { op: FsOp.READ_FILE, path: "/big.bin" });
    if (!first.ok || first.op !== FsOp.READ_FILE) throw new Error("expected a READ_FILE success response");
    expect(first.more).toBe(true);
    expect(first.contents.byteLength).toBe(FS_SYNC_CHUNK_SIZE);

    const second = send(vfs, state, control, data, { op: FsOp.READ_CHUNK });
    if (!second.ok || second.op !== FsOp.READ_CHUNK) throw new Error("expected a READ_CHUNK success response");
    expect(second.more).toBe(false);
    expect(Array.from(second.contents)).toEqual([42]);
  });

  it("READ_CHUNK with nothing in progress on the channel fails instead of throwing", () => {
    const vfs = createVirtualFileSystem();
    const { control, data } = makeChannel();
    const state = createSyncFsServerState();

    const response = send(vfs, state, control, data, { op: FsOp.READ_CHUNK });
    expect(response).toMatchObject({ ok: false, code: "EINVAL" });
  });
});
