import { describe, expect, it, vi } from "vitest";
import { createNetRelay } from "./netRelay";

const fakeWorker = () => ({ postMessage: vi.fn() }) as unknown as Worker & { postMessage: ReturnType<typeof vi.fn> };

describe("createNetRelay", () => {
  it("connects a client to the process that registered the listener, delivering pipe-open", () => {
    const relay = createNetRelay();
    const server = fakeWorker();
    const client = fakeWorker();
    relay.registerWorker("server-1", server);
    relay.registerWorker("client-1", client);

    relay.pipeListen("server-1", "\0dwc-tcp:3000");
    const connId = relay.pipeConnect("client-1", "\0dwc-tcp:3000");

    expect(connId).toBeGreaterThan(0);
    expect(server.postMessage).toHaveBeenCalledWith({
      type: "net-pipe-message",
      payload: { type: "pipe-open", connId, path: "\0dwc-tcp:3000" },
    });
  });

  it("returns connId 0 when nobody listens on the key", () => {
    const relay = createNetRelay();
    relay.registerWorker("client-1", fakeWorker());
    expect(relay.pipeConnect("client-1", "\0dwc-tcp:9999")).toBe(0);
  });

  it("returns connId 0 when the listening process's worker is gone", () => {
    const relay = createNetRelay();
    const server = fakeWorker();
    relay.registerWorker("server-1", server);
    relay.pipeListen("server-1", "\0dwc-tcp:3000");
    relay.unregisterWorker("server-1");

    expect(relay.pipeConnect("client-1", "\0dwc-tcp:3000")).toBe(0);
  });

  it("relays a data message to the OTHER end of the connection, by connId", () => {
    const relay = createNetRelay();
    const server = fakeWorker();
    const client = fakeWorker();
    relay.registerWorker("server-1", server);
    relay.registerWorker("client-1", client);
    relay.pipeListen("server-1", "key");
    const connId = relay.pipeConnect("client-1", "key");

    const chunk = new Uint8Array([1, 2, 3]);
    relay.relay("client-1", { type: "pipe-data", connId, chunk });
    expect(server.postMessage).toHaveBeenCalledWith({
      type: "net-pipe-message",
      payload: { type: "pipe-data", connId, chunk },
    });

    relay.relay("server-1", { type: "pipe-data", connId, chunk });
    expect(client.postMessage).toHaveBeenCalledWith({
      type: "net-pipe-message",
      payload: { type: "pipe-data", connId, chunk },
    });
  });

  it("forgets the connection after a pipe-close relay", () => {
    const relay = createNetRelay();
    const server = fakeWorker();
    const client = fakeWorker();
    relay.registerWorker("server-1", server);
    relay.registerWorker("client-1", client);
    relay.pipeListen("server-1", "key");
    const connId = relay.pipeConnect("client-1", "key");

    relay.relay("client-1", { type: "pipe-close", connId });
    server.postMessage.mockClear();

    // The connection is gone now — a further relay for the same connId is a no-op.
    relay.relay("client-1", { type: "pipe-data", connId, chunk: new Uint8Array() });
    expect(server.postMessage).not.toHaveBeenCalled();
  });

  it("ignores a relay for an unknown connId", () => {
    const relay = createNetRelay();
    expect(() => relay.relay("client-1", { type: "pipe-data", connId: 999 })).not.toThrow();
  });

  it("unregistering a process cleans up its listeners and connections", () => {
    const relay = createNetRelay();
    const server = fakeWorker();
    const client = fakeWorker();
    relay.registerWorker("server-1", server);
    relay.registerWorker("client-1", client);
    relay.pipeListen("server-1", "key");
    const connId = relay.pipeConnect("client-1", "key");

    relay.unregisterWorker("server-1");

    // The listener is gone, so a fresh connect fails...
    expect(relay.pipeConnect("client-1", "key")).toBe(0);
    // ...and the existing connection's relay is now a no-op (server side gone).
    client.postMessage.mockClear();
    relay.relay("client-1", { type: "pipe-data", connId, chunk: new Uint8Array() });
    expect(client.postMessage).not.toHaveBeenCalled();
  });

  // Traced need: the dev-server preview feature has the KERNEL itself dial
  // into a guest's listening port on the host page's behalf - it isn't a
  // real Process Worker, so it can't be `registerWorker()`'d the normal way.
  describe("virtual clients (a non-Worker relay participant, e.g. the kernel itself)", () => {
    it("pipeConnect() from a virtual client delivers pipe-open to the real server worker", () => {
      const relay = createNetRelay();
      const server = fakeWorker();
      relay.registerWorker("server-1", server);
      relay.pipeListen("server-1", "key");

      const received: unknown[] = [];
      relay.registerVirtualClient("preview-1", (message) => received.push(message));
      const connId = relay.pipeConnect("preview-1", "key");

      expect(connId).toBeGreaterThan(0);
      expect(server.postMessage).toHaveBeenCalledWith({
        type: "net-pipe-message",
        payload: { type: "pipe-open", connId, path: "key" },
      });
    });

    it("relays data back to the virtual client's callback instead of postMessage", () => {
      const relay = createNetRelay();
      const server = fakeWorker();
      relay.registerWorker("server-1", server);
      relay.pipeListen("server-1", "key");

      const received: unknown[] = [];
      relay.registerVirtualClient("preview-1", (message) => received.push(message));
      const connId = relay.pipeConnect("preview-1", "key");
      server.postMessage.mockClear();

      const chunk = new Uint8Array([1, 2, 3]);
      relay.relay("server-1", { type: "pipe-data", connId, chunk });

      expect(received).toEqual([{ type: "pipe-data", connId, chunk }]);
      expect(server.postMessage).not.toHaveBeenCalled();
    });

    it("a virtual client can also send data (relay() from the virtual client's own id)", () => {
      const relay = createNetRelay();
      const server = fakeWorker();
      relay.registerWorker("server-1", server);
      relay.pipeListen("server-1", "key");

      relay.registerVirtualClient("preview-1", () => {});
      const connId = relay.pipeConnect("preview-1", "key");
      server.postMessage.mockClear();

      const chunk = new Uint8Array([9, 9]);
      relay.relay("preview-1", { type: "pipe-data", connId, chunk });

      expect(server.postMessage).toHaveBeenCalledWith({ type: "net-pipe-message", payload: { type: "pipe-data", connId, chunk } });
    });

    it("unregisterVirtualClient cleans up its connections", () => {
      const relay = createNetRelay();
      const server = fakeWorker();
      relay.registerWorker("server-1", server);
      relay.pipeListen("server-1", "key");
      relay.registerVirtualClient("preview-1", () => {});
      const connId = relay.pipeConnect("preview-1", "key");

      relay.unregisterVirtualClient("preview-1");
      server.postMessage.mockClear();

      relay.relay("server-1", { type: "pipe-data", connId, chunk: new Uint8Array() });
      expect(server.postMessage).not.toHaveBeenCalled();
    });
  });

  it("listen()/closeServer() and pipeListen()/pipeCloseServer() are plain registries", () => {
    const relay = createNetRelay();
    const client = fakeWorker();
    relay.registerWorker("p1", client);
    relay.listen("p1", 3000);
    relay.closeServer(3000);
    relay.pipeListen("p1", "path-a");
    relay.pipeCloseServer("path-a");
    // No listener remains for either — a connect attempt (via the pipe path,
    // since TCP dials always advertise a pipe key too) fails.
    expect(relay.pipeConnect("other", "path-a")).toBe(0);
  });
});
