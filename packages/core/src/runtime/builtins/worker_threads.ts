// Hand-written, not vendored: real Node's worker_threads wraps genuine OS
// thread creation (internalBinding('worker'), a whole second V8 isolate per
// Worker) - there is no analogous primitive to spin up inside a single
// browser Worker (this runtime already IS one Worker per guest process;
// nesting a full second Node-like sandboxed environment inside that, with
// its own moduleLoader/event loop/message-passing, is a real, separate
// undertaking nothing has traced an actual need for yet).
//
// Traced need: real Vite's own dist/node/chunks/node.js does
// `import { MessageChannel, Worker } from "node:worker_threads"` at its
// top level (so the import itself must resolve, unconditionally, just to
// let the module load at all) - but neither name is actually USED outside
// two specific, non-default code paths (an off-thread config-file importer,
// and a Tinypool-style worker pool for CSS/asset processing), so getting
// past the import is what's actually required right now, not real
// multi-threaded execution.
//
// `MessageChannel`/`MessagePort` ARE real here - they're also a standard
// Web/Worker-global API, already available natively in this environment,
// just missing Node's own `.ref()`/`.unref()` methods (which real Node's
// ports have so a live channel can opt out of keeping the process alive -
// irrelevant here since nothing in this runtime's own event loop tracks
// message ports as handles, so these are safe, real no-ops rather than an
// approximation of a semantic that doesn't apply). `Worker` throws a clear,
// loud error if actually constructed, rather than silently no-op'ing -
// matching this project's own established precedent (vm.ts's
// runInNewContext/createContext, deliberately left unimplemented rather
// than faking isolation) for a capability that's a substantially bigger,
// separate piece of work, not something to fake quietly.
const wrapPort = (port: MessagePort): MessagePort => {
  const anyPort = port as MessagePort & { unref?: () => void; ref?: () => void };
  anyPort.unref ??= () => {};
  anyPort.ref ??= () => {};
  return port;
};

class DwcMessageChannel {
  port1: MessagePort;
  port2: MessagePort;
  constructor() {
    const { port1, port2 } = new MessageChannel();
    this.port1 = wrapPort(port1);
    this.port2 = wrapPort(port2);
  }
}

class DwcWorker {
  constructor() {
    throw new Error(
      "worker_threads.Worker is not implemented in this runtime - there is no in-VM worker-thread execution yet (see runtime/builtins/worker_threads.ts)",
    );
  }
}

const createWorkerThreadsModule = () => ({
  MessageChannel: DwcMessageChannel,
  MessagePort: globalThis.MessagePort,
  Worker: DwcWorker,
  isMainThread: true,
  parentPort: null,
  threadId: 0,
  workerData: null,
});

export { createWorkerThreadsModule };
