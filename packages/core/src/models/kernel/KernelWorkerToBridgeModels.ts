export enum KernelWTBEventType {
  PING,
}

export type KernelWTBEventHandler = (message: KernelWTBEventMessage) => void;

export type KernelWTBEventMessage =
  | {
      type: KernelWTBEventType;
      [k: string]: unknown;
    }
  | KernelPingMessage;

type KernelPingMessage = {
  type: KernelWTBEventType.PING;
};
