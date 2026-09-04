import { DWCError, ERR_INTERNAL } from "../../protocol/errors";
import type { RequestEnvelope } from "../../protocol/envelope";
import { createProcessTable } from "../../kernel/processTable";
import { createRouter } from "../../kernel/router";
import { createFsClient } from "./fsClient";
import { createProcessClient } from "./processClient";
import type { ShellExecPayload, SpawnPayload } from "./processClient";
import { postErrorReply, postReply } from "./service";

const processTable = createProcessTable();
const router = createRouter();
const fsClient = createFsClient();
const processClient = createProcessClient(fsClient, processTable);

router.handle("PING", () => "PONG");
router.handle("INITIALIZE", () => {
  initialize();
  return undefined;
});
router.handle("PROCESS_LIST", () => processTable.list());
router.handle("FS_REQUEST", (payload) => fsClient.request(payload));
router.handle("PROCESS_SPAWN", (payload) => processClient.spawn(payload as SpawnPayload));
router.handle("SHELL_EXEC", (payload) => processClient.runShell(payload as ShellExecPayload));

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
