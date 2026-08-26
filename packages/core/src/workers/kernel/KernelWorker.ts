import {
  KernelWTBEventMessage,
  KernelWTBEventType,
} from "../../models/kernel/KernelWorkerToBridgeModels";
import { Logger } from "../../utilities/logger";

const logger = new Logger("KernelWorker");

const workPostMessage = (event: KernelWTBEventMessage) =>
  self.postMessage({ ...event });

const log = (...args: any[]) => logger.info(...args);

log("Kernel Worker initialized");
workPostMessage({
  type: KernelWTBEventType.PING,
});

self.onmessage = (event) => {
  log("event", event);
};
