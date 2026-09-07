/// <reference lib="webworker" />
// Intercepts iframe traffic for a preview port and relays it through the
// host page's dwc.preview.fetch() (see Preview.ts's enable()/handleRelay()).
// Registered by the host app itself — see packages/core's own
// "./preview-sw" export and this repo's playground for why this can't be
// auto-registered from a node_modules URL (navigator.serviceWorker.register()
// only accepts a same-origin URL, and a built library's own dist/ output
// isn't reachable at a stable public URL the way `new Worker(new URL(...))`
// is).
//
// Root-absolute-path handling: a guest dev server's own asset requests (e.g.
// "/@vite/client") arrive with no PREVIEW_SCOPE_PREFIX at all, since they're
// resolved by the guest page against its own document URL, not against the
// prefixed URL the iframe originally navigated to. This is recovered by
// remembering, per client, which port its initial prefixed navigation
// resolved to — every later request from that same client is routed there
// even without the prefix.
//
// Cross-Origin-Resource-Policy: a host page that needs SharedArrayBuffer
// (this library's own sync fs bridge does) sets
// Cross-Origin-Embedder-Policy: require-corp on itself, and Chrome enforces
// COEP on EVERY nested browsing context it embeds - including a same-origin
// iframe - requiring the embedded document's own response to carry a
// permissive Cross-Origin-Resource-Policy. A Service-Worker-synthesized
// `new Response()` is no exception: without this header the iframe
// navigation is silently blocked (contentDocument never becomes
// accessible, no error surfaced anywhere obvious) even though the exact
// same response is perfectly retrievable via a plain, non-navigation
// fetch() - verified the hard way while building this.
declare const self: ServiceWorkerGlobalScope;

import { PREVIEW_SCOPE_PREFIX } from "../../apis/previewProtocol";
import type { PreviewRelayRequest, PreviewRelayResponse } from "../../apis/previewProtocol";

type RelayResult = Extract<PreviewRelayResponse, { ok: true }>["result"];

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

async function relay(request: Omit<PreviewRelayRequest, "requestId">): Promise<RelayResult> {
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
      const body = method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await event.request.arrayBuffer());

      try {
        const result = await relay({ port: target.port, path: target.path, method, headers, body });
        // The real Headers constructor doesn't accept an array value for one
        // key (used above for a repeated response header) - folded into a
        // single comma-separated value, same as how HTTP itself represents
        // a repeated header when there's no structured way to keep it split.
        const responseHeaders: Record<string, string> = { "Cross-Origin-Resource-Policy": "cross-origin" };
        for (const [name, value] of Object.entries(result.headers)) {
          responseHeaders[name] = Array.isArray(value) ? value.join(", ") : value;
        }
        return new Response(result.body as BodyInit, { status: result.status, statusText: result.statusMessage, headers: responseHeaders });
      } catch (error) {
        return new Response(`dwc preview relay error: ${String(error)}`, {
          status: 502,
          headers: { "Cross-Origin-Resource-Policy": "cross-origin" },
        });
      }
    })(),
  );
});
