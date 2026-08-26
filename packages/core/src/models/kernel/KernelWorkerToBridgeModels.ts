export enum KernelWTBEventType {}

export type KernelWTBEventHandler = (message: KernelWTBEventMessage) => void;

export type KernelWTBEventMessage = {
  type: KernelWTBEventType;
};
