export enum KernelWTBEventType {
  PING,
  FS_RESPONSE,
  SHELL_RESPONSE,
  PROCESS_SPAWN_ACK,
  PROCESS_DATA,
  PROCESS_EXIT,
}

export type KernelWTBEventHandler = (message: KernelWTBEventMessage) => void;

export type FsErrorPayload = { code: string; path: string; message: string };

export type KernelFsResponseMessage = {
  type: KernelWTBEventType.FS_RESPONSE;
  requestId: string;
} & ({ ok: true; result: unknown } | { ok: false; error: FsErrorPayload });

export type KernelShellResponseMessage = {
  type: KernelWTBEventType.SHELL_RESPONSE;
  requestId: string;
} & ({ ok: true; result: unknown } | { ok: false; error: FsErrorPayload });

export type KernelProcessSpawnAckMessage = {
  type: KernelWTBEventType.PROCESS_SPAWN_ACK;
  requestId: string;
} & (
  | { ok: true; result: { processId: string } }
  | { ok: false; error: FsErrorPayload }
);

export type KernelProcessDataMessage = {
  type: KernelWTBEventType.PROCESS_DATA;
  processId: string;
  stream: "stdout" | "stderr";
  chunk: string;
};

export type KernelProcessExitMessage = {
  type: KernelWTBEventType.PROCESS_EXIT;
  processId: string;
  exitCode: number;
  cwd: string;
};

type KernelPingMessage = {
  type: KernelWTBEventType.PING;
};

export type KernelWTBEventMessage =
  | KernelPingMessage
  | KernelFsResponseMessage
  | KernelShellResponseMessage
  | KernelProcessSpawnAckMessage
  | KernelProcessDataMessage
  | KernelProcessExitMessage;
