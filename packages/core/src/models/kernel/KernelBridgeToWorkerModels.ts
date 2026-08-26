export enum KernelBTWEventType {}

export type KernelBTWEventHandler = (message: KernelBTWEventMessage) => void;

export type KernelBTWEventMessage = {
  type: KernelBTWEventType;
};
