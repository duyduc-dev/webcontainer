import { DWCError, ERR_INTERNAL } from "../../protocol/errors";
import type { RequestEnvelope } from "../../protocol/envelope";
import { createProcessTable } from "./processTable";
import { createRouter } from "./router";
import { postErrorReply, postReply } from "./service";

const processTable = createProcessTable();
const router = createRouter();

router.handle("PING", () => "PONG");
router.handle("INITIALIZE", () => {
  initialize();
  return undefined;
});
router.handle("PROCESS_LIST", () => processTable.list());

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
