import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProcessClient } from "./processClient";
import type { FetcherClient } from "./fetcherClient";
import type { FsClient } from "./fsClient";
import { DWCError } from "../../protocol/errors";

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: unknown[] = [];

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  terminate() {}
}

const fakeFsClient = (): FsClient =>
  ({
    request: vi.fn().mockResolvedValue({ sources: {} }),
    attachSyncChannel: vi.fn(),
  }) as unknown as FsClient;

const fakeProcessTable = () => {
  let counter = 0;
  return {
    register: vi.fn(() => ({ id: `p${++counter}` })),
    remove: vi.fn(),
    list: vi.fn(() => []),
  };
};

describe("createProcessClient — net-request forwarding", () => {
  const originalWorker = globalThis.Worker;
  const originalSelf = (globalThis as { self?: unknown }).self;
  let spawned: FakeWorker | undefined;

  beforeEach(() => {
    // processClient.ts's createSyncFsChannelFor reads self.crossOriginIsolated,
    // and workers/kernel/service.ts's postEvent (fired for stdout/etc) posts to
    // self.postMessage; vitest's "node" environment has neither. Not
    // cross-origin isolated here keeps these tests on the plain
    // (no SharedArrayBuffer) path.
    (globalThis as { self?: unknown }).self = { crossOriginIsolated: false, postMessage: vi.fn() };
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
    (globalThis as { self?: unknown }).self = originalSelf;
    spawned = undefined;
  });

  const setup = (fetcherClient: FetcherClient) => {
    class SpawningWorker extends FakeWorker {
      constructor() {
        super();
        spawned = this;
      }
    }
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = SpawningWorker;

    const fsClient = fakeFsClient();
    // preloadModuleGraph reads the entry file via fsClient.request({action:"readFile",...})
    (fsClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(new TextEncoder().encode("// entry"));
    return createProcessClient(fsClient, fakeProcessTable() as never, fetcherClient);
  };

  it("forwards a spawned process's net-request to the fetcher client and replies with net-response", async () => {
    const fetcherClient: FetcherClient = { request: vi.fn().mockResolvedValue({ status: 200, ok: true }) };
    const client = setup(fetcherClient);

    await client.spawn({ entryPath: "/index.js" });
    spawned!.onmessage?.({ data: { type: "net-request", payload: { id: "req-1", url: "https://example.com" } } } as MessageEvent);
    await Promise.resolve();
    await Promise.resolve();

    expect(fetcherClient.request).toHaveBeenCalledWith({ url: "https://example.com" });
    expect(spawned!.posted).toContainEqual({
      type: "net-response",
      payload: { id: "req-1", ok: true, result: { status: 200, ok: true } },
    });
  });

  it("replies with a net-response error when the fetcher client rejects", async () => {
    const fetcherClient: FetcherClient = {
      request: vi.fn().mockRejectedValue(new DWCError("ERR_NET_FETCH_FAILED", "boom")),
    };
    const client = setup(fetcherClient);

    await client.spawn({ entryPath: "/index.js" });
    spawned!.onmessage?.({ data: { type: "net-request", payload: { id: "req-2", url: "https://example.com" } } } as MessageEvent);
    await Promise.resolve();
    await Promise.resolve();

    expect(spawned!.posted).toContainEqual({
      type: "net-response",
      payload: { id: "req-2", ok: false, error: { code: "ERR_NET_FETCH_FAILED", message: "boom" } },
    });
  });

  it("does not touch the fetcher client for stdout/stderr/exit messages", async () => {
    const fetcherClient: FetcherClient = { request: vi.fn() };
    const client = setup(fetcherClient);

    await client.spawn({ entryPath: "/index.js" });
    spawned!.onmessage?.({ data: { type: "stdout", payload: { chunk: new Uint8Array() } } } as MessageEvent);

    expect(fetcherClient.request).not.toHaveBeenCalled();
  });
});
