export enum KernelBTWEventType {
  FS_REQUEST,
  SHELL_REQUEST,
  PROCESS_SPAWN,
  PREVIEW_FETCH,
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

export type PreviewFetchOp = {
  op: "previewFetch";
  port: number;
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
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

export type KernelPreviewFetchMessage = {
  type: KernelBTWEventType.PREVIEW_FETCH;
  requestId: string;
} & PreviewFetchOp;

export type KernelBTWEventMessage =
  | KernelFsRequestMessage
  | KernelShellRequestMessage
  | KernelProcessSpawnMessage
  | KernelPreviewFetchMessage;

export type KernelBTWEventHandler = (message: KernelBTWEventMessage) => void;

export type KernelRequestPayload =
  | ({ type: KernelBTWEventType.FS_REQUEST } & FsOp)
  | ({ type: KernelBTWEventType.SHELL_REQUEST } & ShellOp)
  | ({ type: KernelBTWEventType.PROCESS_SPAWN } & ProcessSpawnOp)
  | ({ type: KernelBTWEventType.PREVIEW_FETCH } & PreviewFetchOp);
