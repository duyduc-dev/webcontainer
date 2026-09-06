import { afterEach, describe, expect, it } from "vitest";
import { createEventLoop } from "../eventLoop";
import { createNodeModules } from "./loader";

interface NetModule {
  createServer(handler: (socket: SocketLike) => void): ServerLike;
  connect(port: number, host?: string, cb?: () => void): SocketLike;
  connect(options: { port: number; host?: string }, cb?: () => void): SocketLike;
  isIP(input: string): number;
}
interface ServerLike {
  listen(port: number, cb?: () => void): ServerLike;
  close(cb?: () => void): ServerLike;
  address(): { port: number } | null;
}
interface SocketLike {
  write(data: string | Uint8Array): boolean;
  end(data?: string): void;
  on(event: string, listener: (...args: any[]) => void): SocketLike;
  destroy(): void;
}

// 'net' needs a real Buffer as a global (bindings/net.ts's `buf()` helper) —
// mirrors what workers/process/worker.ts installs before booting a script.
const installGlobalBuffer = (nodeModules: ReturnType<typeof createNodeModules>) => {
  (globalThis as { Buffer?: unknown }).Buffer = (nodeModules.require("buffer") as { Buffer: unknown }).Buffer;
};

let stopPump: (() => void) | null = null;

afterEach(() => {
  stopPump?.();
  stopPump = null;
});

/** Builds a fresh event loop + 'net', and starts pumping it in the background
 * for the rest of the test — net's own nextTick-scheduled work (a 'listening'
 * event, a connection completing, a close callback) only runs while something
 * is actively driving the loop, so this has to run CONCURRENTLY with whatever
 * promises the test awaits, not just after them. */
const setup = () => {
  const eventLoop = createEventLoop();
  const process = { env: {}, nextTick: eventLoop.nextTick };
  const nodeModules = createNodeModules(process, {
    queueClose: eventLoop.queueClose,
    ref: eventLoop.ref,
    unref: eventLoop.unref,
  });
  installGlobalBuffer(nodeModules);
  const net = nodeModules.require("net") as NetModule;

  let stopped = false;
  stopPump = () => {
    stopped = true;
  };
  void (async () => {
    while (!stopped) {
      const didWork = await eventLoop.runOnce();
      if (!didWork && !eventLoop.hasPendingWork()) break;
    }
  })();

  return { net, eventLoop };
};

describe("vendored 'net' (same-process loopback TCP)", () => {
  it("connects a client to its own server and exchanges data both ways", async () => {
    const { net } = setup();
    const received: string[] = [];

    const server = net.createServer((socket) => {
      socket.on("data", (chunk: { toString(): string }) => received.push(`server got: ${chunk.toString()}`));
      socket.write("hello from server");
    });

    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = server.address()!.port;
    expect(port).toBeGreaterThan(0);

    await new Promise<void>((resolve) => {
      const client = net.connect(port, "localhost", () => {
        client.write("hello from client");
      });
      client.on("data", (chunk: { toString(): string }) => {
        received.push(`client got: ${chunk.toString()}`);
        client.end();
      });
      client.on("close", () => server.close(() => resolve()));
    });

    expect(received).toContain("server got: hello from client");
    expect(received).toContain("client got: hello from server");
  });

  it("rejects connecting to a port nobody listens on with ECONNREFUSED", async () => {
    const { net } = setup();

    const error: Error & { code?: string } = await new Promise((resolve) => {
      const client = net.connect(59999, "localhost");
      client.on("error", resolve);
    });

    expect(error.code).toBe("ECONNREFUSED");
  });

  it("rejects connecting to a genuinely external host instead of retargeting an in-VM server", async () => {
    const { net } = setup();

    const server = net.createServer(() => {});
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = server.address()!.port;

    const error: Error & { code?: string } = await new Promise((resolve) => {
      const client = net.connect(port, "api.example.com");
      client.on("error", resolve);
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(error.code).toMatch(/EHOSTUNREACH|ENOTFOUND/);
  });

  it("isIP reports the correct family", () => {
    const { net } = setup();
    expect(net.isIP("127.0.0.1")).toBe(4);
    expect(net.isIP("::1")).toBe(6);
    expect(net.isIP("not-an-ip")).toBe(0);
  });
});
