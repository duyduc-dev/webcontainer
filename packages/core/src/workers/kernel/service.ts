import { createErrorReply, createEvent, createReply } from "../../protocol/envelope";

const postReply = (id: string, result?: unknown): void => {
  self.postMessage(createReply(id, result));
};

const postErrorReply = (id: string, code: string, message: string): void => {
  self.postMessage(createErrorReply(id, code, message));
};

const postEvent = (type: string, payload?: unknown): void => {
  self.postMessage(createEvent(type, payload));
};

export { postErrorReply, postEvent, postReply };
