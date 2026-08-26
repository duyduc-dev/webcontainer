export enum KernelWTBEventType {
  PING,
  FS_RESPONSE,
  SHELL_RESPONSE,
  PROCESS_SPAWN_ACK,
  PROCESS_DATA,
  PROCESS_EXIT,
  PREVIEW_FETCH_RESPONSE,
  LISTEN,
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

export type PreviewFetchResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: "utf8" | "base64";
};

export type KernelPreviewFetchResponseMessage = {
  type: KernelWTBEventType.PREVIEW_FETCH_RESPONSE;
  requestId: string;
} & ({ ok: true; result: PreviewFetchResult } | { ok: false; error: FsErrorPayload });

export type KernelListenMessage = {
  type: KernelWTBEventType.LISTEN;
  port: number;
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
  | KernelProcessExitMessage
  | KernelPreviewFetchResponseMessage
  | KernelListenMessage;
