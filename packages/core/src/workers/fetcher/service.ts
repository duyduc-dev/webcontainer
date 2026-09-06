import { createErrorReply, createReply } from "../../protocol/envelope";

const postReply = (id: string, result?: unknown): void => {
  self.postMessage(createReply(id, result));
};

const postErrorReply = (id: string, code: string, message: string): void => {
  self.postMessage(createErrorReply(id, code, message));
};

export { postErrorReply, postReply };
