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

/** Public `dwc.preview` facade - proxies each call to the kernel worker's
 * PREVIEW_FETCH handler (workers/kernel/previewRelay.ts). */
const createPreviewAPI = (request: Requester): PreviewAPI => {
  let serviceWorkerReady: Promise<ServiceWorkerRegistration> | undefined;

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

  return {
    fetch: fetchImpl,

    url: (port, path = "/") => `${PREVIEW_SCOPE_PREFIX}${port}${path}`,

    enable: (options) => {
      if (!("serviceWorker" in navigator)) {
        return Promise.reject(new Error("dwc preview: Service Workers are not supported in this environment"));
      }

      if (!serviceWorkerReady) {
        serviceWorkerReady = navigator.serviceWorker.register(options.swUrl, { scope: options.scope ?? "/" }).then(async (registration) => {
          await navigator.serviceWorker.ready;
          navigator.serviceWorker.addEventListener("message", handleRelay);
          return registration;
        });
      }

      return serviceWorkerReady;
    },
  };
};

export { createPreviewAPI };
export type { PreviewAPI, PreviewEnableOptions, PreviewFetchInit, PreviewFetchResult };
