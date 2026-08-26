import { KernelWTBEventMessage } from "../../models/kernel/KernelWorkerToBridgeModels";

const workPostMessage = (event: KernelWTBEventMessage) =>
  self.postMessage({ ...event });
