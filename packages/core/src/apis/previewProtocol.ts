// Shared between the page-side Preview API (Preview.ts) and the
// PreviewServiceWorker bundle (built as a separate entry - see
// tsup.config.ts - so this file is compiled into both outputs; kept tiny on
// purpose). The Service Worker can't reach the kernel directly (it has no
// bridge of its own), so it relays every intercepted fetch through the host
// page via postMessage, using these message shapes.
//
// `body` travels as a real Uint8Array/undefined, not a base64 string:
// postMessage between a page and its own Service Worker uses the structured
// clone algorithm, which transfers typed arrays natively - there's no
// intermediate JSON-only transport here (unlike dwc.preview.fetch()'s own
// underlying kernel bridge, which this reuses unchanged) that would force a
// text-safe encoding.

const PREVIEW_SCOPE_PREFIX = "/__dwc_preview__/";

interface PreviewRelayRequest {
  requestId: string;
  port: number;
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array;
}

type PreviewRelayResponse = { requestId: string } & (
  | { ok: true; result: { status: number; statusMessage: string; headers: Record<string, string | string[]>; body: Uint8Array } }
  | { ok: false; error: string }
);

export { PREVIEW_SCOPE_PREFIX };
export type { PreviewRelayRequest, PreviewRelayResponse };
