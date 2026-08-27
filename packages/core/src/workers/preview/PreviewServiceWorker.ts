/// <reference lib="webworker" />
// Intercepts iframe traffic for a preview port and relays it through the
// page's dwc.preview.fetch() (see Preview.ts's enable()). Registered by the
// host app itself — see the package's "./preview-sw" export and README notes
// on why this can't be auto-registered from a node_modules URL.
//
// Root-absolute-path handling: a guest dev server's own asset requests (e.g.
// "/@vite/client") arrive with no PREVIEW_SCOPE_PREFIX at all, since they're
// resolved by the guest page against its own document URL. We recover the
// right port for those by remembering, per client, which port its initial
// prefixed navigation resolved to — every later request from that same
// client is routed there even without the prefix.
declare const self: ServiceWorkerGlobalScope;

import { PREVIEW_SCOPE_PREFIX, PreviewRelayRequest, PreviewRelayResponse } from "../../apis/previewProtocol";

type RelayResult = { status: number; headers: Record<string, string>; body: string; bodyEncoding: "utf8" | "base64" };

const clientPorts = new Map<string, number>();
const pending = new Map<string, { resolve: (result: RelayResult) => void; reject: (error: unknown) => void }>();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  const message = event.data as PreviewRelayResponse;
  if (!message || typeof message.requestId !== "string") return;
  const entry = pending.get(message.requestId);
  if (!entry) return;
  pending.delete(message.requestId);
  if (message.ok) {
    entry.resolve(message.result);
  } else {
    entry.reject(new Error(message.error));
  }
});

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function relay(request: Omit<PreviewRelayRequest, "requestId">) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const host = clients.find((client) => client.frameType === "top-level") ?? clients[0];
  if (!host) throw new Error("dwc preview: no host page available to relay the request to");

  const requestId = crypto.randomUUID();
  return new Promise<RelayResult>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    const relayRequest: PreviewRelayRequest = { ...request, requestId };
    host.postMessage(relayRequest);
  });
}

function resolvePreviewTarget(url: URL, event: FetchEvent): { port: number; path: string } | undefined {
  if (url.pathname.startsWith(PREVIEW_SCOPE_PREFIX)) {
    const rest = url.pathname.slice(PREVIEW_SCOPE_PREFIX.length);
    const slashIndex = rest.indexOf("/");
    const port = Number(slashIndex === -1 ? rest : rest.slice(0, slashIndex));
    const path = (slashIndex === -1 ? "/" : rest.slice(slashIndex)) + url.search;

    const clientId = event.clientId || event.resultingClientId;
    if (clientId) clientPorts.set(clientId, port);
    return { port, path };
  }

  const trackedPort = clientPorts.get(event.clientId);
  if (trackedPort !== undefined) {
    return { port: trackedPort, path: url.pathname + url.search };
  }

  return undefined;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const target = resolvePreviewTarget(url, event);
  if (!target) return; // not a tracked preview request — let the browser handle it normally

  event.respondWith(
    (async () => {
      const method = event.request.method;
      const headers = Object.fromEntries(event.request.headers.entries());
      const body = method === "GET" || method === "HEAD" ? undefined : await event.request.text();

      try {
        const result = await relay({ port: target.port, path: target.path, method, headers, body });
        const responseBody = result.bodyEncoding === "base64" ? base64ToBytes(result.body) : result.body;
        return new Response(responseBody as BodyInit, { status: result.status, headers: result.headers });
      } catch (error) {
        return new Response(`dwc preview relay error: ${String(error)}`, { status: 502 });
      }
    })(),
  );
});
