import { ERR_NOT_IMPLEMENTED } from "../../protocol/errors";
import type { RequestEnvelope } from "../../protocol/envelope";
import { postErrorReply, postReply } from "./service";

self.onmessage = (event: MessageEvent<RequestEnvelope>) => {
  const { id, type } = event.data;

  if (type === "PING") {
    postReply(id, "PONG");
    return;
  }

  if (type === "INITIALIZE") {
    initialize();
    postReply(id, undefined);
    return;
  }

  postErrorReply(id, ERR_NOT_IMPLEMENTED, `Unknown request type: ${type}`);
};

function initialize() {}
