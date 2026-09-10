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
import { injectPreviewWsBootstrap } from "./previewHtmlInject";

type RelayResult = Extract<PreviewRelayResponse, { ok: true }>["result"];

// Cross-Origin-Resource-Policy alone covers cross-origin SUBRESOURCES under
// COEP; a nested browsing context's own DOCUMENT is a separate rule - when
// the embedding page has Cross-Origin-Embedder-Policy: require-corp, every
// framed document (same-origin or not) must carry a compatible COEP header
// on its own response too, or Chromium blocks the navigation outright with
// net::ERR_BLOCKED_BY_RESPONSE (confirmed via a real, hand-driven-equivalent
// Playwright run - not the CORP-only gap the earlier fetch()-only test had
// already covered, which never exercised a navigation response at all).
const NAVIGATION_ISOLATION_HEADERS: Record<string, string> = {
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// Base-path aware: this Service Worker's own registered scope may not be
// the domain root (e.g. a GitHub Pages project page registers it under
// "/my-repo/") - `self.registration.scope` is the browser's own resolved,
// absolute answer for that, always available once this script is running.
// Every incoming request this worker is asked to handle already carries
// that scope as a path prefix (the browser only ever routes requests
// inside a Service Worker's scope to it in the first place), so requests
// under PREVIEW_SCOPE_PREFIX must be matched with the scope prefixed on,
// matching Preview.ts's own `url()` doing the same on the host-page side.
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const EFFECTIVE_PREVIEW_PREFIX = (SCOPE_PATH.endsWith("/") ? SCOPE_PATH.slice(0, -1) : SCOPE_PATH) + PREVIEW_SCOPE_PREFIX;

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
  if (url.pathname.startsWith(EFFECTIVE_PREVIEW_PREFIX)) {
    const rest = url.pathname.slice(EFFECTIVE_PREVIEW_PREFIX.length);
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

  const responsePromise = (async () => {
    const method = event.request.method;
    const headers = Object.fromEntries(event.request.headers.entries());
    const body = method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await event.request.arrayBuffer());

    try {
      const result = await relay({ port: target.port, path: target.path, method, headers, body });
      // The real Headers constructor doesn't accept an array value for one
      // key (used above for a repeated response header) - folded into a
      // single comma-separated value, same as how HTTP itself represents
      // a repeated header when there's no structured way to keep it split.
      const responseHeaders: Record<string, string> = { ...NAVIGATION_ISOLATION_HEADERS };
      for (const [name, value] of Object.entries(result.headers)) {
        responseHeaders[name] = Array.isArray(value) ? value.join(", ") : value;
      }

      let responseBody: Uint8Array = result.body;
      const contentType = responseHeaders["content-type"];
      const isHtml = typeof contentType === "string" && contentType.toLowerCase().includes("text/html");
      // Only ever rewritten when uncompressed - this worker never decodes
      // content-encoding (fetchFromGuestServer/HttpParser hand back raw
      // wire bytes), and Vite's own dev server doesn't compress by default,
      // so this covers the real case and explicitly no-ops the rare
      // compressed one rather than corrupting it.
      if (isHtml && !responseHeaders["content-encoding"]) {
        responseBody = new TextEncoder().encode(injectPreviewWsBootstrap(new TextDecoder().decode(result.body)));
        // The original length is stale once the body is rewritten; a
        // Response derives the real length from the buffer itself, so an
        // absent header is safe where a wrong one may not be.
        delete responseHeaders["content-length"];
      }

      return new Response(responseBody as BodyInit, { status: result.status, statusText: result.statusMessage, headers: responseHeaders });
    } catch (error) {
      return new Response(`dwc preview relay error: ${String(error)}`, {
        status: 502,
        headers: NAVIGATION_ISOLATION_HEADERS,
      });
    }
  })();

  // event.waitUntil() alongside respondWith(): a navigation's extended-
  // lifetime guarantee is otherwise tied only to respondWith's own promise -
  // this is candidate (a) from PROGRESS.md's async-iframe-navigation
  // investigation, added defensively regardless of root cause since it
  // costs nothing and is standard practice for async SW responses.
  event.respondWith(responsePromise);
  event.waitUntil(responsePromise);
});
