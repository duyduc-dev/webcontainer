export enum KernelBTWEventType {
  FS_REQUEST,
  SHELL_REQUEST,
  PROCESS_SPAWN,
}

export type FsOp =
  | { op: "mkdir"; path: string; recursive?: boolean }
  | { op: "writeFile"; path: string; data: Uint8Array }
  | { op: "readFile"; path: string }
  | { op: "readdir"; path: string }
  | { op: "stat"; path: string }
  | { op: "rm"; path: string; recursive?: boolean }
  | { op: "rename"; from: string; to: string };

export type ShellOp = { op: "shellExec"; shellId: string; line: string };
export type ProcessSpawnOp = {
  op: "processSpawn";
  shellId: string;
  line: string;
};

export type KernelFsRequestMessage = {
  type: KernelBTWEventType.FS_REQUEST;
  requestId: string;
} & FsOp;

export type KernelShellRequestMessage = {
  type: KernelBTWEventType.SHELL_REQUEST;
  requestId: string;
} & ShellOp;

export type KernelProcessSpawnMessage = {
  type: KernelBTWEventType.PROCESS_SPAWN;
  requestId: string;
} & ProcessSpawnOp;

export type KernelBTWEventMessage =
  | KernelFsRequestMessage
  | KernelShellRequestMessage
  | KernelProcessSpawnMessage;

export type KernelBTWEventHandler = (message: KernelBTWEventMessage) => void;

export type KernelRequestPayload =
  | ({ type: KernelBTWEventType.FS_REQUEST } & FsOp)
  | ({ type: KernelBTWEventType.SHELL_REQUEST } & ShellOp)
  | ({ type: KernelBTWEventType.PROCESS_SPAWN } & ProcessSpawnOp);
