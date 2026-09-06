import { afterEach, describe, expect, it } from "vitest";
import { createFetcherClient } from "./fetcherClient";

class EchoWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  lastMessage: { id: string; type: string; payload?: unknown } | null = null;

  postMessage(message: { id: string; type: string; payload?: unknown }) {
    this.lastMessage = message;
    if (message.type === "NET_REQUEST") {
      queueMicrotask(() => {
        this.onmessage?.({
          data: { id: message.id, ok: true, result: { status: 200, ok: true, headers: {}, bodyBytes: new ArrayBuffer(0) } },
        } as MessageEvent);
      });
    }
  }

  terminate() {}
}

class FailingWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: { id: string; type: string }) {
    queueMicrotask(() => {
      this.onmessage?.({
        data: { id: message.id, ok: false, error: { code: "ERR_NET_FETCH_FAILED", message: "boom" } },
      } as MessageEvent);
    });
  }

  terminate() {}
}

describe("createFetcherClient", () => {
  const originalWorker = globalThis.Worker;

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  it("lazily spawns the fetcher worker and resolves on a successful reply", async () => {
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = EchoWorker;

    const client = createFetcherClient();
    const result = await client.request({ url: "https://example.com/x" });

    expect(result).toMatchObject({ status: 200, ok: true });
  });

  it("sends the request payload as a NET_REQUEST envelope", async () => {
    let spawned: EchoWorker | undefined;
    class CapturingWorker extends EchoWorker {
      constructor() {
        super();
        spawned = this;
      }
    }
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = CapturingWorker;

    const client = createFetcherClient();
    await client.request({ url: "https://example.com/x", method: "POST" });

    expect(spawned?.lastMessage).toMatchObject({
      type: "NET_REQUEST",
      payload: { url: "https://example.com/x", method: "POST" },
    });
  });

  it("rejects with a DWCError on an error reply", async () => {
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = FailingWorker;

    const client = createFetcherClient();
    await expect(client.request({ url: "https://example.com/x" })).rejects.toMatchObject({
      code: "ERR_NET_FETCH_FAILED",
    });
  });

  it("reuses the same worker across multiple requests", async () => {
    let constructions = 0;
    class CountingWorker extends EchoWorker {
      constructor() {
        super();
        constructions++;
      }
    }
    // @ts-expect-error test stub, not a full Worker implementation
    globalThis.Worker = CountingWorker;

    const client = createFetcherClient();
    await client.request({ url: "https://example.com/a" });
    await client.request({ url: "https://example.com/b" });

    expect(constructions).toBe(1);
  });
});
