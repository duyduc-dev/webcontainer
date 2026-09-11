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
  terminated = false;

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

const fakeFsClient = (): FsClient =>
  ({
    request: vi.fn().mockResolvedValue({ sources: {} }),
    attachSyncChannel: vi.fn(),
  }) as unknown as FsClient;

const fakeProcessTable = () => {
  let counter = 0;
  const workers = new Map<string, unknown>();
  return {
    register: vi.fn(() => ({ id: `p${++counter}` })),
    remove: vi.fn(),
    list: vi.fn(() => []),
    setWorker: vi.fn((id: string, worker: unknown) => {
      workers.set(id, worker);
    }),
    getWorker: vi.fn((id: string) => workers.get(id)),
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

  // Traced need: dwc.preview's iframe-preview flow depends on
  // dwc.addEventListener("listen", ({ port }) => ...) actually firing -
  // previously net-listen only updated netRelay's internal port->processId
  // map and never reached the host page at all.
  it("posts a top-level 'listen' event once the guest's net-pipe-listen registers the port for preview dialing", async () => {
    const fetcherClient: FetcherClient = { request: vi.fn() };
    const client = setup(fetcherClient);

    await client.spawn({ entryPath: "/index.js" });
    // bindings/net.ts always posts these two messages together, in this
    // order, for one net.Server.listen(port) call.
    spawned!.onmessage?.({ data: { type: "net-listen", payload: { port: 4321 } } } as MessageEvent);
    spawned!.onmessage?.({ data: { type: "net-pipe-listen", payload: { key: "\u0000dwc-tcp:4321" } } } as MessageEvent);

    const postMessage = (globalThis as unknown as { self: { postMessage: ReturnType<typeof vi.fn> } }).self
      .postMessage;
    expect(postMessage).toHaveBeenCalledWith({ type: "listen", payload: { port: 4321 } });
  });

  // Traced need (root cause of an intermittent "nothing is listening on
  // port N" on a fresh page's very first preview): firing "listen" from
  // net-listen raced the host page's resulting iframe navigation against
  // net-pipe-listen - the message dwc.preview.fetch()'s netRelay.pipeConnect()
  // actually depends on - landing first. This pins the fix to the message
  // that matters, not just the one that arrives first.
  it("does not post a top-level 'listen' event from net-listen alone, before net-pipe-listen arrives", async () => {
    const fetcherClient: FetcherClient = { request: vi.fn() };
    const client = setup(fetcherClient);

    await client.spawn({ entryPath: "/index.js" });
    spawned!.onmessage?.({ data: { type: "net-listen", payload: { port: 4321 } } } as MessageEvent);

    const postMessage = (globalThis as unknown as { self: { postMessage: ReturnType<typeof vi.fn> } }).self
      .postMessage;
    expect(postMessage).not.toHaveBeenCalledWith({ type: "listen", payload: { port: 4321 } });
  });

  it("does not post a top-level 'listen' event for a net-pipe-listen that isn't a TCP port (a real named pipe)", async () => {
    const fetcherClient: FetcherClient = { request: vi.fn() };
    const client = setup(fetcherClient);

    await client.spawn({ entryPath: "/index.js" });
    spawned!.onmessage?.({ data: { type: "net-pipe-listen", payload: { key: "/tmp/my.sock" } } } as MessageEvent);

    const postMessage = (globalThis as unknown as { self: { postMessage: ReturnType<typeof vi.fn> } }).self
      .postMessage;
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "listen" }));
  });

  it("does not touch the fetcher client for stdout/stderr/exit messages", async () => {
    const fetcherClient: FetcherClient = { request: vi.fn() };
    const client = setup(fetcherClient);

    await client.spawn({ entryPath: "/index.js" });
    spawned!.onmessage?.({ data: { type: "stdout", payload: { chunk: new Uint8Array() } } } as MessageEvent);

    expect(fetcherClient.request).not.toHaveBeenCalled();
  });

  it("stdin() posts a chunk to the real process Worker previously registered for that processId (dwc.process.spawn()'s host-facing .stdin writable stream)", async () => {
    const fetcherClient: FetcherClient = { request: vi.fn() };
    const client = setup(fetcherClient);

    const { processId } = await client.spawn({ entryPath: "/index.js" });
    const chunk = new TextEncoder().encode("y\n");
    client.stdin({ processId, chunk });

    expect(spawned!.posted).toContainEqual({ type: "stdin", payload: { chunk } });
  });

  it("stdin() for an unknown/already-exited processId is a silent no-op, not a throw", async () => {
    const fetcherClient: FetcherClient = { request: vi.fn() };
    const client = setup(fetcherClient);
    await client.spawn({ entryPath: "/index.js" });

    expect(() => client.stdin({ processId: "no-such-process", chunk: new Uint8Array() })).not.toThrow();
  });

  it("kill() terminates the process Worker and reports a code-143 exit, mirroring child_process.kill()'s own convention", async () => {
    const fetcherClient: FetcherClient = { request: vi.fn() };
    const client = setup(fetcherClient);
    const { processId } = await client.spawn({ entryPath: "/index.js" });

    client.kill({ processId });

    expect(spawned!.terminated).toBe(true);
    const postMessage = (globalThis as unknown as { self: { postMessage: ReturnType<typeof vi.fn> } }).self
      .postMessage;
    expect(postMessage).toHaveBeenCalledWith({ type: "process:exit", payload: { processId, code: 143 } });
  });

  it("kill() for an unknown/already-exited processId is a silent no-op, not a throw", async () => {
    const fetcherClient: FetcherClient = { request: vi.fn() };
    const client = setup(fetcherClient);
    await client.spawn({ entryPath: "/index.js" });

    expect(() => client.kill({ processId: "no-such-process" })).not.toThrow();
  });
});

describe("createProcessClient — runShell (cd, node, and /bin PATH resolution)", () => {
  const originalWorker = globalThis.Worker;
  const originalSelf = (globalThis as { self?: unknown }).self;
  let spawnedWorkers: FakeWorker[] = [];

  beforeEach(() => {
    (globalThis as { self?: unknown }).self = { crossOriginIsolated: false, postMessage: vi.fn() };
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
    (globalThis as { self?: unknown }).self = originalSelf;
    spawnedWorkers = [];
  });

  /** Action-aware fake FS: readFile answers preloadModuleGraph, exists defaults
   * to true (as if every resolved /bin/<name>.js is present), stat defaults to
   * "is a directory" (for cd's check). Individual tests override via
   * `fsRequest.mockImplementation(...)` for the cases that care. */
  const fakeShellFsClient = (): FsClient => {
    const request = vi.fn(async (payload: { action: string }) => {
      switch (payload.action) {
        case "readFile":
          return new TextEncoder().encode("// entry");
        case "exists":
          return true;
        case "stat":
          return { isFile: false, isDirectory: true, size: 0, mtimeMs: 0 };
        case "writeFile":
          return undefined;
        default:
          return { sources: {} };
      }
    });
    return { request, attachSyncChannel: vi.fn() } as unknown as FsClient;
  };

  const setup = (fsClient: FsClient = fakeShellFsClient()) => {
    class SpawningWorker extends FakeWorker {
      constructor() {
        super();
        spawnedWorkers.push(this);
      }
    }
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = SpawningWorker;

    const fetcherClient: FetcherClient = { request: vi.fn() };
    return {
      client: createProcessClient(fsClient, fakeProcessTable() as never, fetcherClient, createNetRelay()),
      fetcherClient,
      fsClient,
    };
  };

  const encoder = new TextEncoder();
  const waitForWorker = async (index: number): Promise<FakeWorker> => {
    await vi.waitFor(() => expect(spawnedWorkers.length).toBeGreaterThan(index));
    return spawnedWorkers[index]!;
  };
  const finishWith = (worker: FakeWorker, code: number): void => {
    worker.onmessage?.({ data: { type: "exit", payload: { code } } } as MessageEvent);
  };

  it("routes 'node <script>' through the same boot path spawn() uses", async () => {
    const { client } = setup();

    const resultPromise = client.runShell({ line: "node script.js", cwd: "/project" });
    // bootProcess()'s preload step is a chain of several awaits; wait for the
    // worker to actually be constructed rather than counting microtask ticks.
    const worker = await waitForWorker(0);

    expect(worker.posted).toEqual([
      expect.objectContaining({
        type: "boot",
        payload: expect.objectContaining({ entryPath: "/project/script.js", argv: [], cwd: "/project" }),
      }),
    ]);

    worker.onmessage?.({ data: { type: "stdout", payload: { chunk: encoder.encode("hello\n") } } } as MessageEvent);
    finishWith(worker, 0);

    await expect(resultPromise).resolves.toEqual({ output: "hello\n", cwd: "/project" });
  });

  it("seeds a default PATH env for the spawned program - a real `npm create <pkg>` failed with \"command not found\" for a correctly-fetched-and-bin-linked package because real npm's own setPATH() only EXTENDS an existing PATH-shaped env key, never creates one from scratch, so an empty env here left every descendant spawn permanently PATH-less", async () => {
    const { client } = setup();

    const resultPromise = client.runShell({ line: "ls", cwd: "/project" });
    const worker = await waitForWorker(0);

    expect(worker.posted).toEqual([
      expect.objectContaining({
        type: "boot",
        payload: expect.objectContaining({ env: { PATH: "/bin" } }),
      }),
    ]);

    finishWith(worker, 0);
    await resultPromise;
  });

  it("resolves a script path relative to cwd and forwards extra argv to the script", async () => {
    const { client } = setup();

    const resultPromise = client.runShell({ line: "node ./bin/cli.js --flag", cwd: "/project" });
    const worker = await waitForWorker(0);

    expect(worker.posted).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ entryPath: "/project/bin/cli.js", argv: ["--flag"] }),
      }),
    ]);

    finishWith(worker, 0);
    await resultPromise;
  });

  it("collects both stdout and stderr into the final output", async () => {
    const { client } = setup();

    const resultPromise = client.runShell({ line: "node script.js", cwd: "/" });
    const worker = await waitForWorker(0);

    worker.onmessage?.({ data: { type: "stdout", payload: { chunk: encoder.encode("out\n") } } } as MessageEvent);
    worker.onmessage?.({ data: { type: "stderr", payload: { chunk: encoder.encode("err\n") } } } as MessageEvent);
    finishWith(worker, 1);

    await expect(resultPromise).resolves.toEqual({ output: "out\nerr\n", cwd: "/" });
  });

  it("forwards net-request from a node-via-shell script to the fetcher client", async () => {
    const { client, fetcherClient } = setup();
    (fetcherClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 200 });

    const resultPromise = client.runShell({ line: "node script.js", cwd: "/" });
    const worker = await waitForWorker(0);

    worker.onmessage?.({ data: { type: "net-request", payload: { id: "r1", url: "https://example.com" } } } as MessageEvent);
    await vi.waitFor(() => expect((fetcherClient.request as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));

    expect(fetcherClient.request).toHaveBeenCalledWith({ url: "https://example.com" });

    finishWith(worker, 0);
    await resultPromise;
  });

  it("rejects with a clear error when 'node' is given no script", async () => {
    const { client } = setup();
    await expect(client.runShell({ line: "node", cwd: "/" })).rejects.toThrow(/missing script operand/);
  });

  it("cd updates cwd via an async stat check, without spawning a process", async () => {
    const { client, fsClient } = setup();

    const result = await client.runShell({ line: "cd /project", cwd: "/" });

    expect(result).toEqual({ output: "", cwd: "/project" });
    expect(fsClient.request).toHaveBeenCalledWith({ action: "stat", path: "/project" });
    expect(spawnedWorkers).toHaveLength(0);
  });

  it("cd rejects a target that is not a directory", async () => {
    const fsClient = fakeShellFsClient();
    (fsClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ isFile: true, isDirectory: false, size: 0, mtimeMs: 0 });
    const { client } = setup(fsClient);

    await expect(client.runShell({ line: "cd /a-file", cwd: "/" })).rejects.toThrow(/not a directory/);
  });

  it("resolves a non-node command against /bin/<name>.js and boots it the same way as spawn()", async () => {
    const { client, fsClient } = setup();

    const resultPromise = client.runShell({ line: "echo hi", cwd: "/" });
    const worker = await waitForWorker(0);

    expect(fsClient.request).toHaveBeenCalledWith({ action: "exists", path: "/bin/echo.js" });
    expect(worker.posted).toEqual([
      expect.objectContaining({
        type: "boot",
        payload: expect.objectContaining({ entryPath: "/bin/echo.js", argv: ["hi"], cwd: "/" }),
      }),
    ]);

    worker.onmessage?.({ data: { type: "stdout", payload: { chunk: encoder.encode("hi\n") } } } as MessageEvent);
    finishWith(worker, 0);

    await expect(resultPromise).resolves.toEqual({ output: "hi\n", cwd: "/" });
  });

  it("throws a clear error when no /bin/<name>.js exists for the command", async () => {
    const fsClient = fakeShellFsClient();
    (fsClient.request as ReturnType<typeof vi.fn>).mockImplementation(async (payload: { action: string }) =>
      payload.action === "exists" ? false : new TextEncoder().encode("// entry"),
    );
    const { client } = setup(fsClient);

    await expect(client.runShell({ line: "nope", cwd: "/" })).rejects.toThrow(/nope: command not found/);
  });

  it("chains 'node <script>' with a PATH-resolved command via && (no longer restricted to the sole command)", async () => {
    const { client } = setup();

    const resultPromise = client.runShell({ line: "node script.js && echo done", cwd: "/" });
    const nodeWorker = await waitForWorker(0);
    finishWith(nodeWorker, 0);

    const echoWorker = await waitForWorker(1);
    expect(echoWorker.posted).toEqual([expect.objectContaining({ payload: expect.objectContaining({ entryPath: "/bin/echo.js", argv: ["done"] }) })]);
    echoWorker.onmessage?.({ data: { type: "stdout", payload: { chunk: encoder.encode("done\n") } } } as MessageEvent);
    finishWith(echoWorker, 0);

    await expect(resultPromise).resolves.toEqual({ output: "done\n", cwd: "/" });
  });

  it("&& short-circuits after a non-zero exit, never spawning the next command", async () => {
    const { client } = setup();

    const resultPromise = client.runShell({ line: "false && echo nope", cwd: "/" });
    const worker = await waitForWorker(0);
    finishWith(worker, 1);

    await expect(resultPromise).resolves.toEqual({ output: "", cwd: "/" });
    expect(spawnedWorkers).toHaveLength(1);
  });

  it("> redirects a command's output to a file instead of the returned output", async () => {
    const { client, fsClient } = setup();

    const resultPromise = client.runShell({ line: "echo hi > /x/f", cwd: "/" });
    const worker = await waitForWorker(0);
    worker.onmessage?.({ data: { type: "stdout", payload: { chunk: encoder.encode("hi\n") } } } as MessageEvent);
    finishWith(worker, 0);

    await expect(resultPromise).resolves.toEqual({ output: "", cwd: "/" });
    expect(fsClient.request).toHaveBeenCalledWith({ action: "writeFile", path: "/x/f", contents: "hi\n" });
  });
});

describe("createProcessClient — spawnShell/killShell (streaming progress for a shell line)", () => {
  const originalWorker = globalThis.Worker;
  const originalSelf = (globalThis as { self?: unknown }).self;
  let spawnedWorkers: FakeWorker[] = [];
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessage = vi.fn();
    (globalThis as { self?: unknown }).self = { crossOriginIsolated: false, postMessage };
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
    (globalThis as { self?: unknown }).self = originalSelf;
    spawnedWorkers = [];
  });

  const fakeShellFsClient = (): FsClient => {
    const request = vi.fn(async (payload: { action: string }) => {
      switch (payload.action) {
        case "readFile":
          return new TextEncoder().encode("// entry");
        case "exists":
          return true;
        default:
          return { sources: {} };
      }
    });
    return { request, attachSyncChannel: vi.fn() } as unknown as FsClient;
  };

  const setup = () => {
    class SpawningWorker extends FakeWorker {
      constructor() {
        super();
        spawnedWorkers.push(this);
      }
    }
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = SpawningWorker;

    const fetcherClient: FetcherClient = { request: vi.fn() };
    return createProcessClient(fakeShellFsClient(), fakeProcessTable() as never, fetcherClient, createNetRelay());
  };

  const waitForWorker = async (index: number): Promise<FakeWorker> => {
    await vi.waitFor(() => expect(spawnedWorkers.length).toBeGreaterThan(index));
    return spawnedWorkers[index]!;
  };
  const encoder = new TextEncoder();

  it("relays stdout as shell:<shellId> events AS PRODUCED, not buffered until exit", async () => {
    const client = setup();

    const { shellId } = await client.spawnShell({ line: "echo hi", cwd: "/" });
    const worker = await waitForWorker(0);
    worker.onmessage?.({ data: { type: "stdout", payload: { chunk: encoder.encode("hi\n") } } } as MessageEvent);

    expect(postMessage).toHaveBeenCalledWith({ type: "shell:stdout", payload: { shellId, chunk: encoder.encode("hi\n") } });
    // Posted as soon as the chunk arrives - no exit event yet.
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "shell:exit" }));

    worker.onmessage?.({ data: { type: "exit", payload: { code: 0 } } } as MessageEvent);
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: "shell:exit", payload: { shellId, code: 0 } }));
  });

  it("killShell() terminates the currently-running worker and posts a 143 exit", async () => {
    const client = setup();

    const { shellId } = await client.spawnShell({ line: "sleep 5", cwd: "/" });
    const worker = await waitForWorker(0);

    client.killShell({ shellId });

    expect(worker.terminated).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "shell:exit", payload: { shellId, code: 143 } });
  });

  it("killShell() is a silent no-op for an unknown shellId", async () => {
    const client = setup();
    expect(() => client.killShell({ shellId: "does-not-exist" })).not.toThrow();
  });
});

describe("createProcessClient — child_process guest-to-kernel relay (cp-spawn/cp-exec/cp-kill)", () => {
  const originalWorker = globalThis.Worker;
  const originalSelf = (globalThis as { self?: unknown }).self;
  let spawnedWorkers: FakeWorker[] = [];

  beforeEach(() => {
    (globalThis as { self?: unknown }).self = { crossOriginIsolated: false, postMessage: vi.fn() };
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
    (globalThis as { self?: unknown }).self = originalSelf;
    spawnedWorkers = [];
  });

  const fakeShellFsClient = (): FsClient => {
    const request = vi.fn(async (payload: { action: string }) => {
      switch (payload.action) {
        case "readFile":
          return new TextEncoder().encode("// entry");
        case "exists":
          return true;
        case "stat":
          return { isFile: false, isDirectory: true, size: 0, mtimeMs: 0 };
        case "writeFile":
          return undefined;
        default:
          return { sources: {} };
      }
    });
    return { request, attachSyncChannel: vi.fn() } as unknown as FsClient;
  };

  const setup = (fsClient: FsClient = fakeShellFsClient()) => {
    class SpawningWorker extends FakeWorker {
      constructor() {
        super();
        spawnedWorkers.push(this);
      }
    }
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = SpawningWorker;

    const fetcherClient: FetcherClient = { request: vi.fn() };
    return { client: createProcessClient(fsClient, fakeProcessTable() as never, fetcherClient, createNetRelay()), fsClient };
  };

  const encoder = new TextEncoder();
  const waitForWorker = async (index: number): Promise<FakeWorker> => {
    await vi.waitFor(() => expect(spawnedWorkers.length).toBeGreaterThan(index));
    return spawnedWorkers[index]!;
  };
  const finishWith = (worker: FakeWorker, code: number): void => {
    worker.onmessage?.({ data: { type: "exit", payload: { code } } } as MessageEvent);
  };

  it("cp-spawn resolves the command against /bin and relays the child's stdout/exit back as cp-event", async () => {
    const { client } = setup();

    await client.spawn({ entryPath: "/parent.js" });
    const parent = await waitForWorker(0);

    parent.onmessage?.({ data: { type: "cp-spawn", payload: { id: "req-1", command: "echo", args: ["hi"], cwd: "/", env: {} } } } as MessageEvent);
    const child = await waitForWorker(1);

    expect(child.posted).toEqual([
      expect.objectContaining({ type: "boot", payload: expect.objectContaining({ entryPath: "/bin/echo.js", argv: ["hi"] }) }),
    ]);

    child.onmessage?.({ data: { type: "stdout", payload: { chunk: encoder.encode("hi\n") } } } as MessageEvent);
    finishWith(child, 0);

    expect(parent.posted).toContainEqual({ type: "cp-event", payload: { id: "req-1", kind: "stdout", chunk: encoder.encode("hi\n") } });
    expect(parent.posted).toContainEqual({ type: "cp-event", payload: { id: "req-1", kind: "exit", code: 0 } });
  });

  it("cp-spawn replies with a cp-event error when the command can't be resolved", async () => {
    const fsClient = fakeShellFsClient();
    (fsClient.request as ReturnType<typeof vi.fn>).mockImplementation(async (payload: { action: string }) =>
      payload.action === "exists" ? false : new TextEncoder().encode("// entry"),
    );
    const { client } = setup(fsClient);

    await client.spawn({ entryPath: "/parent.js" });
    const parent = await waitForWorker(0);

    parent.onmessage?.({ data: { type: "cp-spawn", payload: { id: "req-2", command: "nope", args: [], cwd: "/", env: {} } } } as MessageEvent);

    await vi.waitFor(() =>
      expect(parent.posted).toContainEqual({ type: "cp-event", payload: { id: "req-2", kind: "error", message: "nope: command not found" } }),
    );
    expect(spawnedWorkers).toHaveLength(1);
  });

  it("cp-kill terminates the child worker and relays a synthetic exit back to the parent", async () => {
    const { client } = setup();

    await client.spawn({ entryPath: "/parent.js" });
    const parent = await waitForWorker(0);

    parent.onmessage?.({ data: { type: "cp-spawn", payload: { id: "req-3", command: "sleep", args: ["5"], cwd: "/", env: {} } } } as MessageEvent);
    const child = await waitForWorker(1);
    const terminateSpy = vi.spyOn(child, "terminate");

    parent.onmessage?.({ data: { type: "cp-kill", payload: { id: "req-3" } } } as MessageEvent);

    expect(terminateSpy).toHaveBeenCalledTimes(1);
    expect(parent.posted).toContainEqual({ type: "cp-event", payload: { id: "req-3", kind: "exit", code: 143 } });
  });

  it("cp-exec runs the line through the same shell runShell() uses and replies once with the buffered result", async () => {
    const { client } = setup();

    await client.spawn({ entryPath: "/parent.js" });
    const parent = await waitForWorker(0);

    parent.onmessage?.({ data: { type: "cp-exec", payload: { id: "req-4", line: "echo hi", cwd: "/" } } } as MessageEvent);
    const shellWorker = await waitForWorker(1);
    shellWorker.onmessage?.({ data: { type: "stdout", payload: { chunk: encoder.encode("hi\n") } } } as MessageEvent);
    finishWith(shellWorker, 0);

    await vi.waitFor(() =>
      expect(parent.posted).toContainEqual({
        type: "cp-exec-response",
        payload: { id: "req-4", ok: true, result: { output: "hi\n", cwd: "/", exitCode: 0 } },
      }),
    );
  });

  it("cp-exec replies with ok:false when the shell line throws", async () => {
    const fsClient = fakeShellFsClient();
    (fsClient.request as ReturnType<typeof vi.fn>).mockImplementation(async (payload: { action: string }) =>
      payload.action === "exists" ? false : new TextEncoder().encode("// entry"),
    );
    const { client } = setup(fsClient);

    await client.spawn({ entryPath: "/parent.js" });
    const parent = await waitForWorker(0);

    parent.onmessage?.({ data: { type: "cp-exec", payload: { id: "req-5", line: "nope", cwd: "/" } } } as MessageEvent);

    await vi.waitFor(() =>
      expect(parent.posted).toContainEqual({
        type: "cp-exec-response",
        payload: { id: "req-5", ok: false, error: { message: "nope: command not found" } },
      }),
    );
  });
});
