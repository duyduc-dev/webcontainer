import { KernelBridge } from "../bridges/kernel/KernelBridge";
import { KernelBTWEventType } from "../models/kernel/KernelBridgeToWorkerModels";
import { PreviewFetchResult } from "../models/kernel/KernelWorkerToBridgeModels";
import { PREVIEW_SCOPE_PREFIX, PreviewRelayRequest, PreviewRelayResponse } from "./previewProtocol";

export type PreviewFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type PreviewEnableOptions = {
  swUrl: string;
  scope?: string;
};

// Stage A of the dev-server-preview milestone: a direct fetch-style API, no
// iframe/Service Worker routing yet (that's a separate follow-up — see
// ARCHITECTURE notes on Vivari's root-absolute-path and origin-isolation
// concerns, which only matter once real browser navigation is intercepted).
export class Preview {
  private serviceWorkerReady?: Promise<ServiceWorkerRegistration>;

  constructor(private readonly bridge: KernelBridge) {}

  fetch(port: number, path: string, init: PreviewFetchInit = {}): Promise<PreviewFetchResult> {
    return this.bridge.request({
      type: KernelBTWEventType.PREVIEW_FETCH,
      op: "previewFetch",
      port,
      path,
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body: init.body,
    });
  }

  // Stage B: the URL to point a preview <iframe>'s src at, once enable() has
  // registered the Service Worker that routes its traffic to this port.
  url(port: number, path = "/"): string {
    return `${PREVIEW_SCOPE_PREFIX}${port}${path}`;
  }

  // Registers the preview Service Worker (idempotent) and starts relaying
  // its fetch requests through this.fetch() — the same call Stage A already
  // uses, just now driven by the browser's own navigation/resource loading
  // instead of application code.
  //
  // If swUrl isn't served from the origin's actual root, the response must
  // include a `Service-Worker-Allowed: /` header — otherwise the browser
  // caps the SW's max scope to swUrl's own directory, and PREVIEW_SCOPE_PREFIX
  // requests outside that directory silently won't be intercepted.
  enable(options: PreviewEnableOptions): Promise<ServiceWorkerRegistration> {
    if (!("serviceWorker" in navigator)) {
      return Promise.reject(new Error("dwc preview: Service Workers are not supported in this environment"));
    }

    if (!this.serviceWorkerReady) {
      this.serviceWorkerReady = navigator.serviceWorker
        .register(options.swUrl, { scope: options.scope ?? "/" })
        .then(async (registration) => {
          await navigator.serviceWorker.ready;
          navigator.serviceWorker.addEventListener("message", (event) => this.handleRelay(event));
          return registration;
        });
    }

    return this.serviceWorkerReady;
  }

  private handleRelay(event: MessageEvent): void {
    const message = event.data as PreviewRelayRequest;
    if (!message || typeof message.requestId !== "string" || typeof message.port !== "number") return;

    const source = event.source as ServiceWorker | null;
    if (!source) return;

    this.fetch(message.port, message.path, { method: message.method, headers: message.headers, body: message.body }).then(
      (result) => {
        const response: PreviewRelayResponse = { requestId: message.requestId, ok: true, result };
        source.postMessage(response);
      },
      (error) => {
        const response: PreviewRelayResponse = { requestId: message.requestId, ok: false, error: String(error) };
        source.postMessage(response);
      },
    );
  }
}
