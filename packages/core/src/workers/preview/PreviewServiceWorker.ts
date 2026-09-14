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
// That memory alone is not enough: a Service Worker is terminated whenever
// it goes idle (Chrome does this after roughly 30 seconds) and restarted
// with completely fresh module state on the next event, so the map is empty
// again while the iframe is still very much alive. Every runtime-generated
// root-absolute URL then escaped to the host application instead — Vite's
// HMR re-imports, dynamic imports, code-split chunks. The map is therefore
// only a cache: on a miss, the target is recovered from the requesting
// client's own document URL, which still carries the prefix and is answered
// by the browser rather than by anything this worker has to remember.
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
import { injectPreviewWsBootstrap, rewritePreviewRootUrls } from "./previewHtmlInject";

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

interface PreviewTarget {
  port: number;
  path: string;
  previewId?: string;
}

const previewBaseForTarget = ({ port, previewId }: PreviewTarget): string =>
  `${EFFECTIVE_PREVIEW_PREFIX}${previewId ? `${previewId}/` : ""}${port}/`;

// Requests for an iframe's assets no longer carry the preview URL prefix,
// so remember both its port and channel from its initial navigation.
const clientPorts = new Map<string, Omit<PreviewTarget, "path">>();
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

// Splits a prefixed preview pathname into the guest port, the optional
// preview channel id, and the path the guest server itself should see.
function parsePreviewPath(pathname: string): PreviewTarget | undefined {
  if (!pathname.startsWith(EFFECTIVE_PREVIEW_PREFIX)) return undefined;

  const rest = pathname.slice(EFFECTIVE_PREVIEW_PREFIX.length);
  const firstSlash = rest.indexOf("/");
  const firstSegment = firstSlash === -1 ? rest : rest.slice(0, firstSlash);
  const firstIsPort = /^\d+$/.test(firstSegment);
  const afterFirst = firstSlash === -1 ? "" : rest.slice(firstSlash + 1);
  const secondSlash = afterFirst.indexOf("/");
  const portText = firstIsPort ? firstSegment : secondSlash === -1 ? afterFirst : afterFirst.slice(0, secondSlash);
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;

  const previewId = firstIsPort ? undefined : firstSegment;
  const path = firstIsPort
    ? firstSlash === -1
      ? "/"
      : rest.slice(firstSlash)
    : secondSlash === -1
      ? "/"
      : afterFirst.slice(secondSlash);

  return { port, path, previewId };
}

function resolvePreviewTarget(url: URL, event: FetchEvent): PreviewTarget | undefined {
  const prefixed = parsePreviewPath(url.pathname);
  if (prefixed) {
    const clientId = event.clientId || event.resultingClientId;
    if (clientId) clientPorts.set(clientId, { port: prefixed.port, previewId: prefixed.previewId });
    return { ...prefixed, path: prefixed.path + url.search };
  }

  // Module imports and worker-owned follow-up requests can identify the
  // iframe through `resultingClientId` instead of `clientId`. Treat both as
  // the same preview client so runtime-generated Vite URLs keep reaching the
  // guest server, not the host application.
  const clientId = event.clientId || event.resultingClientId;
  const trackedTarget = clientPorts.get(clientId);
  if (trackedTarget) {
    return { ...trackedTarget, path: url.pathname + url.search };
  }

  return undefined;
}

// Clients already shown to be something other than a preview iframe (the
// host application's own page, most of all). Purely an optimisation: it
// keeps the asynchronous lookup below to one call per client, after which
// every host request takes the same synchronous "not ours" path as before.
const nonPreviewClients = new Set<string>();

// Only worth an asynchronous client lookup when the request could plausibly
// belong to a preview iframe: same-origin, from a known client, and not a
// navigation (a preview navigation always carries the prefix, so a
// prefix-less one is the host application's own).
function mayBelongToPreviewClient(url: URL, event: FetchEvent): boolean {
  if (url.origin !== self.location.origin) return false;
  if (event.request.mode === "navigate") return false;
  const clientId = event.clientId || event.resultingClientId;
  return Boolean(clientId) && !nonPreviewClients.has(clientId);
}

// Recovers the target after a Service Worker restart has emptied
// clientPorts: the iframe's own document URL still carries the preview
// prefix, and the browser - not this worker's memory - is what answers for
// it. Repopulates the cache so only the first request after a restart pays
// for the lookup.
async function recoverPreviewTarget(url: URL, event: FetchEvent): Promise<PreviewTarget | undefined> {
  const clientId = event.clientId || event.resultingClientId;
  const client = await self.clients.get(clientId);
  if (!client) return undefined;

  const parsed = parsePreviewPath(new URL(client.url).pathname);
  if (!parsed) {
    nonPreviewClients.add(clientId);
    return undefined;
  }

  clientPorts.set(clientId, { port: parsed.port, previewId: parsed.previewId });
  return { port: parsed.port, previewId: parsed.previewId, path: url.pathname + url.search };
}

function respondFromGuest(target: PreviewTarget, event: FetchEvent): Promise<Response> {
  return (async () => {
    const method = event.request.method;
    const headers = Object.fromEntries(event.request.headers.entries());
    const body = method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await event.request.arrayBuffer());

    try {
      const result = await relay({ port: target.port, path: target.path, method, headers, body, previewId: target.previewId });
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
      // wire bytes), and Vite's own dev server doesn't compress by default.
      // Do not rewrite JavaScript: Vite's HMR message names modules by their
      // guest path, and rewriting the module's `import.meta.hot` identifier
      // makes it impossible for the client to match that message. Runtime
      // module and asset requests are instead recovered through clientPorts.
      if (isHtml && !responseHeaders["content-encoding"]) {
        const rewritten = rewritePreviewRootUrls(new TextDecoder().decode(result.body), previewBaseForTarget(target));
        responseBody = new TextEncoder().encode(isHtml ? injectPreviewWsBootstrap(rewritten) : rewritten);
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
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const target = resolvePreviewTarget(url, event);

  // Not obviously a preview request, and not worth asking the browser about
  // - let it be handled normally.
  if (!target && !mayBelongToPreviewClient(url, event)) return;

  const responsePromise = target
    ? respondFromGuest(target, event)
    : (async () => {
        const recovered = await recoverPreviewTarget(url, event);
        // Passing the original request straight through is how this worker
        // declines a request it has already committed to answering.
        return recovered ? respondFromGuest(recovered, event) : fetch(event.request);
      })();

  // event.waitUntil() alongside respondWith(): a navigation's extended-
  // lifetime guarantee is otherwise tied only to respondWith's own promise -
  // this is candidate (a) from PROGRESS.md's async-iframe-navigation
  // investigation, added defensively regardless of root cause since it
  // costs nothing and is standard practice for async SW responses.
  event.respondWith(responsePromise);
  event.waitUntil(responsePromise);
});
