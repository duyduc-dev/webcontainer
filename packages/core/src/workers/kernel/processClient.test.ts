import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProcessClient } from "./processClient";
import type { FetcherClient } from "./fetcherClient";
import type { FsClient } from "./fsClient";
import { createNetRelay } from "./netRelay";
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
    return createProcessClient(fsClient, fakeProcessTable() as never, fetcherClient, createNetRelay());
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

describe("createProcessClient — runShell 'node <script>' interception", () => {
  const originalWorker = globalThis.Worker;
  const originalSelf = (globalThis as { self?: unknown }).self;
  let spawned: FakeWorker | undefined;

  beforeEach(() => {
    (globalThis as { self?: unknown }).self = { crossOriginIsolated: false, postMessage: vi.fn() };
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
    (globalThis as { self?: unknown }).self = originalSelf;
    spawned = undefined;
  });

  const setup = () => {
    class SpawningWorker extends FakeWorker {
      constructor() {
        super();
        spawned = this;
      }
    }
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = SpawningWorker;

    const fsClient = fakeFsClient();
    (fsClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(new TextEncoder().encode("// entry"));
    const fetcherClient: FetcherClient = { request: vi.fn() };
    return {
      client: createProcessClient(fsClient, fakeProcessTable() as never, fetcherClient, createNetRelay()),
      fetcherClient,
    };
  };

  const encoder = new TextEncoder();

  it("routes 'node <script>' through the same boot path spawn() uses, not the shell-as-process worker", async () => {
    const { client } = setup();

    const resultPromise = client.runShell({ line: "node script.js", cwd: "/project" });
    // bootProcess()'s preload step is a chain of several awaits; wait for the
    // worker to actually be constructed rather than counting microtask ticks.
    await vi.waitFor(() => expect(spawned).toBeDefined());

    expect(spawned!.posted).toEqual([
      expect.objectContaining({
        type: "boot",
        payload: expect.objectContaining({ entryPath: "/project/script.js", argv: [], cwd: "/project" }),
      }),
    ]);

    spawned!.onmessage?.({ data: { type: "stdout", payload: { chunk: encoder.encode("hello\n") } } } as MessageEvent);
    spawned!.onmessage?.({ data: { type: "exit", payload: { code: 0 } } } as MessageEvent);

    await expect(resultPromise).resolves.toEqual({ output: "hello\n", cwd: "/project" });
  });

  it("resolves a script path relative to cwd and forwards extra argv to the script", async () => {
    const { client } = setup();

    const resultPromise = client.runShell({ line: "node ./bin/cli.js --flag", cwd: "/project" });
    await vi.waitFor(() => expect(spawned).toBeDefined());

    expect(spawned!.posted).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ entryPath: "/project/bin/cli.js", argv: ["--flag"] }),
      }),
    ]);

    spawned!.onmessage?.({ data: { type: "exit", payload: { code: 0 } } } as MessageEvent);
    await resultPromise;
  });

  it("collects both stdout and stderr into the final output", async () => {
    const { client } = setup();

    const resultPromise = client.runShell({ line: "node script.js", cwd: "/" });
    await vi.waitFor(() => expect(spawned).toBeDefined());

    spawned!.onmessage?.({ data: { type: "stdout", payload: { chunk: encoder.encode("out\n") } } } as MessageEvent);
    spawned!.onmessage?.({ data: { type: "stderr", payload: { chunk: encoder.encode("err\n") } } } as MessageEvent);
    spawned!.onmessage?.({ data: { type: "exit", payload: { code: 1 } } } as MessageEvent);

    await expect(resultPromise).resolves.toEqual({ output: "out\nerr\n", cwd: "/" });
  });

  it("forwards net-request from a node-via-shell script to the fetcher client", async () => {
    const { client, fetcherClient } = setup();
    (fetcherClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 200 });

    const resultPromise = client.runShell({ line: "node script.js", cwd: "/" });
    await vi.waitFor(() => expect(spawned).toBeDefined());

    spawned!.onmessage?.({ data: { type: "net-request", payload: { id: "r1", url: "https://example.com" } } } as MessageEvent);
    await vi.waitFor(() => expect((fetcherClient.request as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));

    expect(fetcherClient.request).toHaveBeenCalledWith({ url: "https://example.com" });

    spawned!.onmessage?.({ data: { type: "exit", payload: { code: 0 } } } as MessageEvent);
    await resultPromise;
  });

  it("rejects with a clear error when 'node' is given no script", async () => {
    const { client } = setup();
    await expect(client.runShell({ line: "node", cwd: "/" })).rejects.toThrow(/missing script operand/);
  });

  it("does not intercept 'node' when chained with && (falls through to the shell-as-process path)", async () => {
    const { client } = setup();

    const resultPromise = client.runShell({ line: "node script.js && echo done", cwd: "/" });
    await Promise.resolve();

    // The shell-as-process path boots via "boot-shell", not "boot".
    expect(spawned!.posted).toEqual([expect.objectContaining({ type: "boot-shell" })]);

    spawned!.onmessage?.({ data: { type: "shell-result", payload: { output: "done\n", cwd: "/" } } } as MessageEvent);
    await expect(resultPromise).resolves.toEqual({ output: "done\n", cwd: "/" });
  });

  it("leaves ordinary (non-node) shell lines on the shell-as-process path", async () => {
    const { client } = setup();

    const resultPromise = client.runShell({ line: "echo hi", cwd: "/" });
    await Promise.resolve();

    expect(spawned!.posted).toEqual([expect.objectContaining({ type: "boot-shell" })]);

    spawned!.onmessage?.({ data: { type: "shell-result", payload: { output: "hi\n", cwd: "/" } } } as MessageEvent);
    await expect(resultPromise).resolves.toEqual({ output: "hi\n", cwd: "/" });
  });
});
