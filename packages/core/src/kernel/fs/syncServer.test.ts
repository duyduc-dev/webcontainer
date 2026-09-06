import { describe, expect, it } from "vitest";
import { createVirtualFileSystem } from "./VirtualFileSystem";
import { serviceSyncFsRequest } from "./syncServer";
import { decodeFsResponse, encodeFsRequest, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED, FsOp } from "./syncWireFormat";

const DATA_SIZE = 4096;

const makeChannel = () => {
  const control = new Int32Array(new SharedArrayBuffer(8));
  const data = new SharedArrayBuffer(DATA_SIZE);
  return { control, data };
};

describe("serviceSyncFsRequest", () => {
  it("ignores the buffer when the control state is not REQUESTED", () => {
    const vfs = createVirtualFileSystem();
    const { control, data } = makeChannel();

    serviceSyncFsRequest(vfs, control, data);

    expect(Atomics.load(control, FS_SYNC_STATE_INDEX)).toBe(0);
  });

  it("services a READ_FILE request and flips control state to RESPONDED", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/a.txt", "hello");
    const { control, data } = makeChannel();

    encodeFsRequest({ op: FsOp.READ_FILE, path: "/a.txt" }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);

    serviceSyncFsRequest(vfs, control, data);

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

    expect(() => serviceSyncFsRequest(vfs, control, data)).not.toThrow();

    const response = decodeFsResponse(data);
    expect(response).toMatchObject({ ok: false, code: "ENOENT", path: "/missing" });
  });

  it("services a WRITE_FILE request and the write is visible on the VFS", () => {
    const vfs = createVirtualFileSystem();
    const { control, data } = makeChannel();

    encodeFsRequest({ op: FsOp.WRITE_FILE, path: "/out.txt", contents: new TextEncoder().encode("hi") }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);

    serviceSyncFsRequest(vfs, control, data);

    expect(new TextDecoder().decode(vfs.readFile("/out.txt"))).toBe("hi");
  });

  it("services a SYMLINK request, then LSTAT reports it as a link and STAT follows it", () => {
    const vfs = createVirtualFileSystem();
    vfs.writeFile("/real.txt", "hi");
    const { control, data } = makeChannel();

    encodeFsRequest({ op: FsOp.SYMLINK, target: "/real.txt", path: "/link.txt" }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);
    serviceSyncFsRequest(vfs, control, data);
    expect(decodeFsResponse(data)).toEqual({ ok: true, op: FsOp.SYMLINK });

    encodeFsRequest({ op: FsOp.LSTAT, path: "/link.txt" }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);
    serviceSyncFsRequest(vfs, control, data);
    const lstat = decodeFsResponse(data);
    expect(lstat).toMatchObject({ ok: true, op: FsOp.LSTAT, isSymbolicLink: true, isFile: false });

    encodeFsRequest({ op: FsOp.STAT, path: "/link.txt" }, data);
    Atomics.store(control, FS_SYNC_STATE_INDEX, FS_SYNC_STATE_REQUESTED);
    serviceSyncFsRequest(vfs, control, data);
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
    serviceSyncFsRequest(vfs, control, data);

    expect(decodeFsResponse(data)).toEqual({ ok: true, op: FsOp.READLINK, target: "../real.txt" });
  });
});
