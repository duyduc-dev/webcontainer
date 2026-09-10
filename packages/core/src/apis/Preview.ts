import { PREVIEW_SCOPE_PREFIX } from "./previewProtocol";
import type { PreviewRelayRequest, PreviewRelayResponse } from "./previewProtocol";

interface PreviewFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
}

interface PreviewFetchResult {
  status: number;
  statusMessage: string;
  headers: Record<string, string | string[]>;
  body: Uint8Array;
}

interface PreviewEnableOptions {
  swUrl: string;
  scope?: string;
}

interface PreviewAPI {
  /** Fetches one request/response from whichever guest process's
   * `http.createServer()` is listening on `port` - the host-page-facing
   * half of dev-server-preview support (Phase 2: kernel-mediated relay).
   * Rejects with `code: "ERR_PREVIEW_CONNECTION_REFUSED"` if nothing is listening. */
  fetch(port: number, path: string, init?: PreviewFetchInit): Promise<PreviewFetchResult>;
  /** The URL to point a preview `<iframe>`'s `src` at, once `enable()` has
   * registered the Service Worker that routes its traffic to `port`. */
  url(port: number, path?: string): string;
  /** Registers the preview Service Worker (idempotent) and starts relaying
   * its intercepted fetch requests through `fetch()` above - the same call
   * a caller could already make directly, just now driven by the browser's
   * own navigation/resource loading instead of application code.
   *
   * If `swUrl` isn't served from the origin's actual root, the response
   * must include a `Service-Worker-Allowed: /` header - otherwise the
   * browser caps the Service Worker's max scope to `swUrl`'s own directory,
   * and requests under PREVIEW_SCOPE_PREFIX outside that directory silently
   * won't be intercepted. */
  enable(options: PreviewEnableOptions): Promise<ServiceWorkerRegistration>;
}

type Requester = <T = unknown>(type: string, payload?: unknown) => Promise<T>;
type Subscriber = (type: string, handler: (payload?: any) => void) => () => void;

/** Public `dwc.preview` facade - proxies each call to the kernel worker's
 * PREVIEW_FETCH handler (workers/kernel/previewRelay.ts). Also relays
 * WebSocket traffic (workers/kernel/previewSocket.ts) between a preview
 * iframe and the kernel: a Service Worker can never intercept a page's own
 * `new WebSocket(...)` call (a real browser platform limitation), so the
 * iframe's injected polyfill (workers/preview/wsPolyfill.ts) talks to THIS
 * host page directly via same-origin postMessage instead - see the
 * `handleIframeMessage` listener below. */
const createPreviewAPI = (request: Requester, on: Subscriber): PreviewAPI => {
  let serviceWorkerReady: Promise<ServiceWorkerRegistration> | undefined;
  // Which iframe (postMessage source) owns a given wsId - recorded the
  // moment its connection opens, so kernel-pushed events know where to
  // deliver. No iframe element reference needs to be threaded into
  // enable() for this - mirroring how PreviewServiceWorker.ts itself
  // discovers "the host page" via self.clients.matchAll() rather than
  // being handed a reference.
  const wsSourceByWsId = new Map<number, MessageEventSource>();
  // The pathname the Service Worker actually ended up registered under
  // (read back from the real ServiceWorkerRegistration, not `options.scope`
  // as passed in - the browser resolves it to an absolute URL, which is the
  // authoritative answer regardless of what shape the caller passed).
  // `null` until `enable()` resolves; `url()` treats that as root ("/"),
  // matching this API's original root-only behavior for a caller who
  // doesn't need `enable()` at all (using `fetch()` directly instead).
  let previewScope: string | null = null;

  const fetchImpl = (port: number, path: string, init: PreviewFetchInit = {}): Promise<PreviewFetchResult> =>
    request<PreviewFetchResult>("PREVIEW_FETCH", { port, path, init });

  const handleRelay = (event: MessageEvent): void => {
    const message = event.data as PreviewRelayRequest;
    if (!message || typeof message.requestId !== "string" || typeof message.port !== "number") return;

    const source = event.source as ServiceWorker | null;
    if (!source) return;

    fetchImpl(message.port, message.path, { method: message.method, headers: message.headers, body: message.body }).then(
      (result) => {
        const response: PreviewRelayResponse = { requestId: message.requestId, ok: true, result };
        source.postMessage(response);
      },
      (error) => {
        const response: PreviewRelayResponse = { requestId: message.requestId, ok: false, error: String(error) };
        source.postMessage(response);
      },
    );
  };

  // Same-origin postMessage channel for the preview iframe's injected WS
  // polyfill (workers/preview/wsPolyfill.ts) - separate from `handleRelay`
  // above (which only ever hears from the Service Worker, keyed by
  // requestId, one reply per request). The iframe is confirmed same-origin
  // with the host page (both under the app's own origin - see
  // previewProtocol.ts's PREVIEW_SCOPE_PREFIX), so `event.origin` is
  // checked instead of relying on any allowlist of expected iframes.
  const handleIframeMessage = (event: MessageEvent): void => {
    if (event.origin !== location.origin) return;
    const message = event.data;
    if (!message || typeof message.type !== "string" || !message.type.startsWith("dwc:ws-")) return;
    const source = event.source;
    if (!source) return;

    if (message.type === "dwc:ws-open") {
      request<{ wsId: number; protocol: string }>("PREVIEW_WS_OPEN", { port: message.port, path: message.path, protocols: message.protocols }).then(
        (result) => {
          wsSourceByWsId.set(result.wsId, source);
          (source as Window).postMessage({ type: "dwc:ws-open-ack", requestId: message.requestId, ...result }, location.origin);
        },
        (error) => {
          (source as Window).postMessage({ type: "dwc:ws-open-error", requestId: message.requestId, error: String(error) }, location.origin);
        },
      );
    } else if (message.type === "dwc:ws-send") {
      request("PREVIEW_WS_SEND", { wsId: message.wsId, data: message.data }).catch(() => {});
    } else if (message.type === "dwc:ws-close") {
      request("PREVIEW_WS_CLOSE", { wsId: message.wsId, code: message.code, reason: message.reason }).catch(() => {});
      wsSourceByWsId.delete(message.wsId);
    }
  };

  return {
    fetch: fetchImpl,

    // Base-path aware: a host app registered under a non-root scope (e.g.
    // GitHub Pages project page at "/my-repo/") needs that prefix on the
    // returned URL too, or it falls outside the Service Worker's own
    // registered scope and is never actually intercepted (see
    // PreviewServiceWorker.ts's matching fix on its own incoming-request
    // side).
    url: (port, path = "/") => {
      const scope = previewScope ?? "/";
      const base = scope.endsWith("/") ? scope.slice(0, -1) : scope;
      return `${base}${PREVIEW_SCOPE_PREFIX}${port}${path}`;
    },

    enable: (options) => {
      if (!("serviceWorker" in navigator)) {
        return Promise.reject(new Error("dwc preview: Service Workers are not supported in this environment"));
      }

      if (!serviceWorkerReady) {
        serviceWorkerReady = navigator.serviceWorker.register(options.swUrl, { scope: options.scope ?? "/" }).then(async (registration) => {
          previewScope = new URL(registration.scope).pathname;
          await navigator.serviceWorker.ready;
          navigator.serviceWorker.addEventListener("message", handleRelay);
          window.addEventListener("message", handleIframeMessage);
          on("preview:ws-message", (payload: { wsId: number; data: string }) => {
            (wsSourceByWsId.get(payload.wsId) as Window | undefined)?.postMessage({ type: "dwc:ws-message", ...payload }, location.origin);
          });
          on("preview:ws-close", (payload: { wsId: number; code: number; reason: string }) => {
            const source = wsSourceByWsId.get(payload.wsId) as Window | undefined;
            wsSourceByWsId.delete(payload.wsId);
            source?.postMessage({ type: "dwc:ws-close", ...payload }, location.origin);
          });
          return registration;
        });
      }

      return serviceWorkerReady;
    },
  };
};

export { createPreviewAPI };
export type { PreviewAPI, PreviewEnableOptions, PreviewFetchInit, PreviewFetchResult };
