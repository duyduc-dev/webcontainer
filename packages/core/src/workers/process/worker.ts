import { createFsBuiltin } from "../../runtime/builtins/fs";
import type { FsBuiltin, FsBuiltinIO } from "../../runtime/builtins/fs";
import { createEventLoop } from "../../runtime/eventLoop";
import { createModuleLoader } from "../../runtime/moduleLoader";
import { runShellLine } from "../../shell/Shell";
import { callSyncFs } from "./syncFsClient";
import type { SyncFsChannel } from "./syncFsClient";
import { postEvent } from "./service";

interface SyncFsChannelPayload {
  port: MessagePort;
  control: SharedArrayBuffer;
  data: SharedArrayBuffer;
}

interface BootPayload {
  entryPath: string;
  sources: Record<string, string>;
  argv: string[];
  env: Record<string, string>;
  cwd: string;
  syncFs: SyncFsChannelPayload | null;
}

interface BootShellPayload {
  line: string;
  cwd: string;
  syncFs: SyncFsChannelPayload | null;
}

interface NetReply {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  bodyBytes: ArrayBuffer;
}

interface NetRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
}

const encoder = new TextEncoder();

let exitCode = 0;
let exited = false;
const pendingNetRequests = new Map<string, { resolve: (reply: NetReply) => void; reject: (error: unknown) => void }>();

/** Bridges the guest realm's globalThis.__dwcFetchAsync (see internal/fetch-transport.js)
 * up through the kernel to the Fetcher Worker — the only place with real network access.
 * Refs the event loop for the duration, since a reply arrives via a real message from
 * another worker, not anything the loop already tracks (a timer/immediate/nextTick). */
const createNetRequest = (eventLoop: ReturnType<typeof createEventLoop>) => {
  return (url: string, init: NetRequestInit = {}): Promise<NetReply> => {
    const id = crypto.randomUUID();
    eventLoop.ref();
    return new Promise<NetReply>((resolve, reject) => {
      pendingNetRequests.set(id, {
        resolve: (reply) => {
          eventLoop.unref();
          resolve(reply);
        },
        reject: (error) => {
          eventLoop.unref();
          reject(error);
        },
      });
      // Copy (never transfer) the body: a Node Buffer may be a view over a
      // shared/pooled ArrayBuffer, and transferring it would detach that pool
      // out from under any other Buffer still referencing it.
      const body = init.body ? init.body.slice().buffer : undefined;
      self.postMessage({
        type: "net-request",
        payload: { id, url, method: init.method, headers: init.headers, body },
      });
    });
  };
};

const handleNetResponse = (payload: { id: string; ok: boolean; result?: NetReply; error?: { code: string; message: string } }): void => {
  const waiting = pendingNetRequests.get(payload.id);
  if (!waiting) return;
  pendingNetRequests.delete(payload.id);

  if (payload.ok) waiting.resolve(payload.result!);
  else waiting.reject(Object.assign(new Error(payload.error!.message), { code: payload.error!.code }));
};

const exitProcess = (code: number): void => {
  if (exited) return;
  exited = true;
  postEvent("exit", { code });
};

const write = (stream: "stdout" | "stderr", text: string): void => {
  postEvent(stream, { chunk: encoder.encode(text) });
};

const createFsBuiltinFromPayload = (syncFs: SyncFsChannelPayload | null): FsBuiltin => {
  const io: FsBuiltinIO = {};

  if (syncFs) {
    const channel: SyncFsChannel = { port: syncFs.port, control: new Int32Array(syncFs.control), data: syncFs.data };
    io.callSync = (request) => callSyncFs(channel, request);
  }

  return createFsBuiltin(io);
};

const boot = (payload: BootPayload): void => {
  const eventLoop = createEventLoop();

  const processGlobal = {
    argv: ["node", payload.entryPath, ...payload.argv],
    env: payload.env,
    cwd: () => payload.cwd,
    exitCode: 0,
    exit(code = 0) {
      exitCode = code;
      exitProcess(exitCode);
    },
    nextTick: eventLoop.nextTick,
  };

  // The module wrapper (new Function) closes over the global scope, so console/process/
  // timers must be real globals here rather than parameters threaded through requires.
  Object.assign(self, {
    console: {
      log: (...args: unknown[]) => write("stdout", `${args.map(String).join(" ")}\n`),
      info: (...args: unknown[]) => write("stdout", `${args.map(String).join(" ")}\n`),
      warn: (...args: unknown[]) => write("stderr", `${args.map(String).join(" ")}\n`),
      error: (...args: unknown[]) => write("stderr", `${args.map(String).join(" ")}\n`),
    },
    process: processGlobal,
    setTimeout: eventLoop.setTimeout,
    clearTimeout: eventLoop.clearTimeout,
    setImmediate: eventLoop.setImmediate,
    clearImmediate: eventLoop.clearImmediate,
    __dwcFetchAsync: createNetRequest(eventLoop),
  });

  const moduleLoader = createModuleLoader({
    sources: payload.sources,
    builtins: { fs: createFsBuiltinFromPayload(payload.syncFs) },
    process: processGlobal,
  });

  try {
    moduleLoader.run(payload.entryPath);
  } catch (error) {
    write("stderr", `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    exitProcess(1);
    return;
  }

  void drain(eventLoop).then(() => exitProcess(exitCode));
};

const bootShell = (payload: BootShellPayload): void => {
  try {
    const fs = createFsBuiltinFromPayload(payload.syncFs);
    const result = runShellLine(payload.line, payload.cwd, fs);
    postEvent("shell-result", result);
  } catch (error) {
    postEvent("shell-error", { message: error instanceof Error ? error.message : String(error) });
  }
};

const drain = async (eventLoop: ReturnType<typeof createEventLoop>): Promise<void> => {
  while (eventLoop.hasPendingWork()) {
    const didWork = await eventLoop.runOnce();
    if (!didWork) break;
  }
};

self.onmessage = (event: MessageEvent<{ type: string; payload?: unknown }>) => {
  if (event.data.type === "boot") boot(event.data.payload as BootPayload);
  else if (event.data.type === "boot-shell") bootShell(event.data.payload as BootShellPayload);
  else if (event.data.type === "net-response") handleNetResponse(event.data.payload as Parameters<typeof handleNetResponse>[0]);
};
