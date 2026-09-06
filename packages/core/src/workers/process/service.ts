import { createEvent } from "../../protocol/envelope";

const postEvent = (type: string, payload?: unknown): void => {
  self.postMessage(createEvent(type, payload));
};

export { postEvent };
