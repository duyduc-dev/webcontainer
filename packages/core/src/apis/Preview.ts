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

interface PreviewAPI {
  /** Fetches one request/response from whichever guest process's
   * `http.createServer()` is listening on `port` - the host-page-facing
   * half of dev-server-preview support (Phase 2: kernel-mediated relay).
   * Rejects with `code: "ERR_PREVIEW_CONNECTION_REFUSED"` if nothing is listening. */
  fetch(port: number, path: string, init?: PreviewFetchInit): Promise<PreviewFetchResult>;
}

type Requester = <T = unknown>(type: string, payload?: unknown) => Promise<T>;

/** Public `dwc.preview` facade - proxies each call to the kernel worker's
 * PREVIEW_FETCH handler (workers/kernel/previewRelay.ts). */
const createPreviewAPI = (request: Requester): PreviewAPI => ({
  fetch: (port, path, init) => request<PreviewFetchResult>("PREVIEW_FETCH", { port, path, init }),
});

export { createPreviewAPI };
export type { PreviewAPI, PreviewFetchInit, PreviewFetchResult };
