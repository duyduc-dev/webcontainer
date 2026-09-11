import { DWCError, ERR_INTERNAL } from "../../protocol/errors";
import type { RequestEnvelope } from "../../protocol/envelope";
import { createProcessTable } from "../../kernel/processTable";
import { createRouter } from "../../kernel/router";
import { createFetcherClient } from "./fetcherClient";
import type { NetRequestPayload } from "./fetcherClient";
import { createFsClient } from "./fsClient";
import { createNetRelay } from "./netRelay";
import { createProcessClient } from "./processClient";
import type { KillPayload, ShellExecPayload, ShellKillPayload, ShellSpawnPayload, SpawnPayload, StdinPayload } from "./processClient";
import { fetchFromGuestServer } from "./previewRelay";
import type { PreviewFetchInit } from "./previewRelay";
import { closePreviewSocket, openPreviewSocket, sendPreviewSocketMessage } from "./previewSocket";
import { postErrorReply, postReply } from "./service";

const processTable = createProcessTable();
const router = createRouter();
const fsClient = createFsClient();
const fetcherClient = createFetcherClient();
const netRelay = createNetRelay();
const processClient = createProcessClient(fsClient, processTable, fetcherClient, netRelay);

// Routes the FS Worker's own unsolicited "fs-change" events (see workers/
// fs/worker.ts's watch registry) back to whichever process worker actually
// registered that watch - the FS Worker only knows a processId (it has no
// handle to any real Worker), processTable is what turns that back into the
// live Worker instance to postMessage(), same lookup PROCESS_STDIN already
// uses via processClient.ts's own `stdin()`.
fsClient.onEvent((event) => {
  if (event.type !== "fs-change") return;
  const { processId, watchId, eventType, filename } = event.payload as {
    processId: string;
    watchId: string;
    eventType: string;
    filename: string;
  };
  processTable.getWorker(processId)?.postMessage({ type: "fs-watch-event", payload: { id: watchId, eventType, filename } });
});

router.handle("PING", () => "PONG");
router.handle("INITIALIZE", () => {
  initialize();
  return undefined;
});
router.handle("PROCESS_LIST", () => processTable.list());
router.handle("FS_REQUEST", (payload) => fsClient.request(payload));
router.handle("NET_REQUEST", (payload) => fetcherClient.request(payload as NetRequestPayload));
router.handle("PROCESS_SPAWN", (payload) => processClient.spawn(payload as SpawnPayload));
router.handle("PROCESS_STDIN", (payload) => {
  processClient.stdin(payload as StdinPayload);
  return undefined;
});
router.handle("PROCESS_KILL", (payload) => {
  processClient.kill(payload as KillPayload);
  return undefined;
});
router.handle("SHELL_EXEC", (payload) => processClient.runShell(payload as ShellExecPayload));
router.handle("SHELL_SPAWN", (payload) => processClient.spawnShell(payload as ShellSpawnPayload));
router.handle("SHELL_KILL", (payload) => {
  processClient.killShell(payload as ShellKillPayload);
  return undefined;
});
router.handle("PREVIEW_FETCH", (payload) => {
  const { port, path, init } = payload as { port: number; path: string; init?: PreviewFetchInit };
  return fetchFromGuestServer(netRelay, port, path, init);
});
router.handle("PREVIEW_WS_OPEN", (payload) => {
  const { port, path, protocols } = payload as { port: number; path: string; protocols?: string[] };
  return openPreviewSocket(netRelay, port, path, protocols);
});
router.handle("PREVIEW_WS_SEND", (payload) => {
  const { wsId, data } = payload as { wsId: number; data: string };
  sendPreviewSocketMessage(wsId, data);
  return undefined;
});
router.handle("PREVIEW_WS_CLOSE", (payload) => {
  const { wsId, code, reason } = payload as { wsId: number; code?: number; reason?: string };
  closePreviewSocket(wsId, code, reason);
  return undefined;
});

self.onmessage = async (event: MessageEvent<RequestEnvelope>) => {
  const { id, type, payload } = event.data;

  try {
    const result = await router.dispatch(type, payload);
    postReply(id, result);
  } catch (error) {
    if (error instanceof DWCError) {
      postErrorReply(id, error.code, error.message);
      return;
    }
    postErrorReply(id, ERR_INTERNAL, error instanceof Error ? error.message : String(error));
  }
};

function initialize() {}

