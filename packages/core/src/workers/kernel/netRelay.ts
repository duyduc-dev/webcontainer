import type { PipeRelayMessage } from "../../runtime/node/bindings/net";

/**
 * Cross-process net relay: lets two separate guest processes (each its own
 * Process Worker) reach each other's `net.Server`s. Same-process net.Server/
 * net.Socket needs none of this (bindings/net.ts's in-memory loopback handles
 * it directly) — this is only the seam for "a different process owns the
 * port/path I'm dialing."
 *
 * Mirrors the Phase 7 net-request/net-response fetch bridge's shape (kernel
 * as the only party that can reach the destination), generalized to a
 * persistent, multi-message connection instead of one request/response:
 * `pipeConnect` mints a connection id and remembers which two processes it
 * joins; `relay` forwards a data/shutdown/close message to whichever end
 * didn't send it, for the life of that connection.
 */
interface NetRelay {
  registerWorker(processId: string, worker: Worker): void;
  unregisterWorker(processId: string): void;
  /** Registers a "virtual client" - a pipe-relay participant that isn't a
   * real Process Worker, e.g. the kernel itself dialing into a guest's
   * listening port on the host page's behalf (traced need: the dev-server
   * preview feature - see workers/kernel/previewRelay.ts). `onMessage` is
   * called in place of `postMessage` whenever this id is the relay target. */
  registerVirtualClient(clientId: string, onMessage: (message: PipeRelayMessage) => void): void;
  unregisterVirtualClient(clientId: string): void;
  /** Fire-and-forget port/path registration — see bindings/net.ts's file
   * header for why this can't be a synchronous, retryable kernel round-trip
   * the way an Atomics.wait-backed bridge would allow. */
  listen(processId: string, port: number): void;
  closeServer(port: number): void;
  pipeListen(processId: string, key: string): void;
  pipeCloseServer(key: string): void;
  /** Synchronous: a local Map lookup + one postMessage to the server's
   * worker. Returns connId 0 when nobody in the VM owns `key`. */
  pipeConnect(clientProcessId: string, key: string): number;
  /** Forwards a relayed message to whichever end of `connId` did NOT send it. */
  relay(fromProcessId: string, message: PipeRelayMessage): void;
}

const createNetRelay = (): NetRelay => {
  const workers = new Map<string, Worker>();
  const virtualClients = new Map<string, (message: PipeRelayMessage) => void>();
  const listeners = new Map<number, string>(); // port -> processId
  const pipeListeners = new Map<string, string>(); // path/key -> processId
  const pipeConns = new Map<number, { clientProcessId: string; serverProcessId: string }>();
  let nextConnId = 1;

  const send = (processId: string, message: { type: string; payload: unknown }): void => {
    const virtual = virtualClients.get(processId);
    if (virtual) {
      virtual(message.payload as PipeRelayMessage);
      return;
    }
    workers.get(processId)?.postMessage(message);
  };

  const registerWorker = (processId: string, worker: Worker): void => {
    workers.set(processId, worker);
  };

  // Notifies whichever end of `connId` did NOT go away, mirroring relay()'s
  // own pipe-close forwarding below — without this, a peer mid-request
  // (e.g. previewRelay.ts's fetchFromGuestServer, awaiting a response via
  // registerVirtualClient) never learns its connection died and its promise
  // hangs forever. Confirmed live: a process worker crashing mid-request
  // (a WASM trap - see PROGRESS.md item 9) left a pending dwc.preview.fetch()
  // call unsettled indefinitely, not merely slow.
  const notifyPeerOfDeath = (connId: number, deadId: string, conn: { clientProcessId: string; serverProcessId: string }): void => {
    const peerId = conn.clientProcessId === deadId ? conn.serverProcessId : conn.clientProcessId;
    send(peerId, { type: "net-pipe-message", payload: { type: "pipe-close", connId } satisfies PipeRelayMessage });
  };

  const unregisterWorker = (processId: string): void => {
    workers.delete(processId);
    for (const [port, owner] of listeners) if (owner === processId) listeners.delete(port);
    for (const [key, owner] of pipeListeners) if (owner === processId) pipeListeners.delete(key);
    for (const [connId, conn] of pipeConns) {
      if (conn.clientProcessId !== processId && conn.serverProcessId !== processId) continue;
      pipeConns.delete(connId);
      notifyPeerOfDeath(connId, processId, conn);
    }
  };

  const registerVirtualClient = (clientId: string, onMessage: (message: PipeRelayMessage) => void): void => {
    virtualClients.set(clientId, onMessage);
  };

  const unregisterVirtualClient = (clientId: string): void => {
    virtualClients.delete(clientId);
    for (const [connId, conn] of pipeConns) {
      if (conn.clientProcessId !== clientId && conn.serverProcessId !== clientId) continue;
      pipeConns.delete(connId);
      notifyPeerOfDeath(connId, clientId, conn);
    }
  };

  const listen = (processId: string, port: number): void => {
    listeners.set(port, processId);
  };

  const closeServer = (port: number): void => {
    listeners.delete(port);
  };

  const pipeListen = (processId: string, key: string): void => {
    pipeListeners.set(key, processId);
  };

  const pipeCloseServer = (key: string): void => {
    pipeListeners.delete(key);
  };

  const pipeConnect = (clientProcessId: string, key: string): number => {
    const serverProcessId = pipeListeners.get(key);
    if (!serverProcessId || !workers.has(serverProcessId)) return 0;

    const connId = nextConnId++;
    pipeConns.set(connId, { clientProcessId, serverProcessId });
    send(serverProcessId, { type: "net-pipe-message", payload: { type: "pipe-open", connId, path: key } satisfies PipeRelayMessage });
    return connId;
  };

  const relay = (fromProcessId: string, message: PipeRelayMessage): void => {
    const conn = pipeConns.get(message.connId);
    if (!conn) return;
    const toProcessId = conn.clientProcessId === fromProcessId ? conn.serverProcessId : conn.clientProcessId;
    send(toProcessId, { type: "net-pipe-message", payload: message });
    if (message.type === "pipe-close") pipeConns.delete(message.connId);
  };

  return {
    registerWorker,
    unregisterWorker,
    registerVirtualClient,
    unregisterVirtualClient,
    listen,
    closeServer,
    pipeListen,
    pipeCloseServer,
    pipeConnect,
    relay,
  };
};

export { createNetRelay };
export type { NetRelay };
