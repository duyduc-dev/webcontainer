// Shared between the page-side Preview API and the PreviewServiceWorker
// bundle (built as a separate entry, so this file is duplicated into both
// outputs — kept tiny on purpose).

export const PREVIEW_SCOPE_PREFIX = "/__dwc_preview__/";

export type PreviewRelayRequest = {
  requestId: string;
  port: number;
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

export type PreviewRelayResponse = {
  requestId: string;
} & (
  | { ok: true; result: { status: number; headers: Record<string, string>; body: string; bodyEncoding: "utf8" | "base64" } }
  | { ok: false; error: string }
);
