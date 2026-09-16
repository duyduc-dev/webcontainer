// src/apis/previewProtocol.ts
var PREVIEW_SCOPE_PREFIX = "/__dwc_preview__/";

// src/workers/preview/wsPolyfill.ts
var PREVIEW_WS_BOOTSTRAP_SCRIPT = `(function () {
  if (window.__dwcRealWebSocket) return; // idempotent guard - never double-install
  window.__dwcRealWebSocket = window.WebSocket;

  // Recovered from THIS document's own initial navigation path (still
  // "${PREVIEW_SCOPE_PREFIX}<id>/<port>/..." or the legacy path without
  // an id) captured eagerly, right now,
  // before any client-side routing (Vite/React Router/etc.) can rewrite
  // location.pathname via the History API - not from the URL passed to
  // the WebSocket constructor, which is robust to whatever hostname/port
  // Vite's own client bundle computes internally.
  var previewMatch = /${PREVIEW_SCOPE_PREFIX.replace(/\//g, "\\/")}(?:([^\\/]+)\\/)?(\\d+)/.exec(location.pathname);
  var PREVIEW_ID = previewMatch && previewMatch[1] ? previewMatch[1] : undefined;
  var DEFAULT_PORT = previewMatch ? Number(previewMatch[2]) : null;

  var nextRequestId = 1;
  var pendingByRequestId = new Map();
  var socketsByWsId = new Map();
  var updateSocketCount = function () {
    window.__dwcPreviewSocketCount = socketsByWsId.size;
  };
  updateSocketCount();

  // A real \`class ... extends EventTarget\` (rather than the old
  // \`Object.create(EventTarget.prototype)\` pattern) is required, not just
  // stylistic - EventTarget's native addEventListener/dispatchEvent
  // implementations brand-check for internal slots that only super()
  // actually sets up; Object.create alone produces a plain object with the
  // right prototype chain but none of that internal state, and every
  // addEventListener call throws "Illegal invocation" (confirmed live).
  class DwcWebSocket extends EventTarget {
    constructor(url, protocols) {
      super();
      var target = new URL(url, location.href);
      this.url = String(url);
      this.protocol = "";
      this.readyState = DwcWebSocket.CONNECTING;
      this._wsId = null;

      var requestId = String(nextRequestId++);
      // Vite 8 derives its HMR URL from location.href, which is the host
      // preview route ("/__dwc_preview__/<id>/<port>/...") rather than the
      // guest server's own root. The kernel dials the guest directly, so
      // strip only that route prefix while retaining Vite's query token.
      var guestPath = target.pathname + target.search;
      if (previewMatch && target.pathname.startsWith(previewMatch[0])) {
        guestPath = target.pathname.slice(previewMatch[0].length) || "/";
        guestPath += target.search;
      }
      pendingByRequestId.set(requestId, this);
      window.parent.postMessage(
        {
          type: "dwc:ws-open",
          requestId: requestId,
          previewId: PREVIEW_ID,
          port: DEFAULT_PORT,
          path: guestPath,
          protocols: protocols == null ? [] : Array.isArray(protocols) ? protocols : [protocols],
        },
        location.origin,
      );
    }

    send(data) {
      if (this.readyState !== DwcWebSocket.OPEN) throw new DOMException("Failed to execute 'send' on 'WebSocket': still in CONNECTING state.", "InvalidStateError");
      window.parent.postMessage({ type: "dwc:ws-send", previewId: PREVIEW_ID, wsId: this._wsId, data: String(data) }, location.origin);
    }

    close(code, reason) {
      if (this.readyState === DwcWebSocket.CLOSING || this.readyState === DwcWebSocket.CLOSED) return;
      this.readyState = DwcWebSocket.CLOSING;
      window.parent.postMessage({ type: "dwc:ws-close", previewId: PREVIEW_ID, wsId: this._wsId, code: code, reason: reason }, location.origin);
    }
  }

  DwcWebSocket.CONNECTING = 0;
  DwcWebSocket.OPEN = 1;
  DwcWebSocket.CLOSING = 2;
  DwcWebSocket.CLOSED = 3;

  // onopen/onmessage/onclose/onerror property-style handlers, in addition
  // to addEventListener - real Vite client code only uses addEventListener
  // (confirmed by reading Vite's own client bundle), but supporting both
  // is cheap and keeps this a faithful WebSocket stand-in for any other
  // guest code sharing the same iframe.
  ["open", "message", "close", "error"].forEach(function (type) {
    var privateKey = "_on" + type;
    Object.defineProperty(DwcWebSocket.prototype, "on" + type, {
      get: function () {
        return this[privateKey] || null;
      },
      set: function (handler) {
        if (this[privateKey]) this.removeEventListener(type, this[privateKey]);
        this[privateKey] = handler;
        if (handler) this.addEventListener(type, handler);
      },
    });
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== location.origin) return;
    var message = event.data;
    if (!message || typeof message.type !== "string") return;

    if (message.type === "dwc:ws-open-ack") {
      var opened = pendingByRequestId.get(message.requestId);
      if (!opened) return;
      pendingByRequestId.delete(message.requestId);
      opened._wsId = message.wsId;
      opened.protocol = message.protocol || "";
      opened.readyState = DwcWebSocket.OPEN;
      socketsByWsId.set(message.wsId, opened);
      updateSocketCount();
      opened.dispatchEvent(new Event("open"));
    } else if (message.type === "dwc:ws-open-error") {
      var failed = pendingByRequestId.get(message.requestId);
      if (!failed) return;
      pendingByRequestId.delete(message.requestId);
      failed.readyState = DwcWebSocket.CLOSED;
      updateSocketCount();
      failed.dispatchEvent(new Event("error"));
      failed.dispatchEvent(new CloseEvent("close", { code: 1006, reason: String(message.error) }));
    } else if (message.type === "dwc:ws-message") {
      var target2 = socketsByWsId.get(message.wsId);
      if (target2) target2.dispatchEvent(new MessageEvent("message", { data: message.data }));
    } else if (message.type === "dwc:ws-close") {
      var closing = socketsByWsId.get(message.wsId);
      if (!closing) return;
      socketsByWsId.delete(message.wsId);
      updateSocketCount();
      closing.readyState = DwcWebSocket.CLOSED;
      closing.dispatchEvent(new CloseEvent("close", { code: message.code, reason: message.reason || "" }));
    }
  });

  window.WebSocket = DwcWebSocket;
})();`;

// src/workers/preview/previewHtmlInject.ts
var HEAD_OPEN_TAG = /<head[^>]*>/i;
var rewritePreviewRootUrls = (content, previewBase) => content.replace(/(\b(?:src|href|action|poster|data)\s*=\s*["'])\/(?!\/)/gi, `$1${previewBase}`);
var injectPreviewWsBootstrap = (html) => {
  const script = `<script>${PREVIEW_WS_BOOTSTRAP_SCRIPT}</script>`;
  const match = HEAD_OPEN_TAG.exec(html);
  if (!match) return script + html;
  const insertAt = match.index + match[0].length;
  return html.slice(0, insertAt) + script + html.slice(insertAt);
};

// src/workers/preview/PreviewServiceWorker.ts
var NAVIGATION_ISOLATION_HEADERS = {
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Cross-Origin-Embedder-Policy": "require-corp"
};
var SCOPE_PATH = new URL(self.registration.scope).pathname;
var EFFECTIVE_PREVIEW_PREFIX = (SCOPE_PATH.endsWith("/") ? SCOPE_PATH.slice(0, -1) : SCOPE_PATH) + PREVIEW_SCOPE_PREFIX;
var previewBaseForTarget = ({ port, previewId }) => `${EFFECTIVE_PREVIEW_PREFIX}${previewId ? `${previewId}/` : ""}${port}/`;
var clientPorts = /* @__PURE__ */ new Map();
var pending = /* @__PURE__ */ new Map();
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", (event) => {
  const message = event.data;
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
async function relay(request) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const host = clients.find((client) => client.frameType === "top-level") ?? clients[0];
  if (!host) throw new Error("dwc preview: no host page available to relay the request to");
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    const relayRequest = { ...request, requestId };
    host.postMessage(relayRequest);
  });
}
function resolvePreviewTarget(url, event) {
  if (url.pathname.startsWith(EFFECTIVE_PREVIEW_PREFIX)) {
    const rest = url.pathname.slice(EFFECTIVE_PREVIEW_PREFIX.length);
    const firstSlash = rest.indexOf("/");
    const firstSegment = firstSlash === -1 ? rest : rest.slice(0, firstSlash);
    const firstIsPort = /^\d+$/.test(firstSegment);
    const afterFirst = firstSlash === -1 ? "" : rest.slice(firstSlash + 1);
    const secondSlash = afterFirst.indexOf("/");
    const portText = firstIsPort ? firstSegment : secondSlash === -1 ? afterFirst : afterFirst.slice(0, secondSlash);
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return void 0;
    const previewId = firstIsPort ? void 0 : firstSegment;
    const path = (firstIsPort ? firstSlash === -1 ? "/" : rest.slice(firstSlash) : secondSlash === -1 ? "/" : afterFirst.slice(secondSlash)) + url.search;
    const clientId2 = event.clientId || event.resultingClientId;
    if (clientId2) clientPorts.set(clientId2, { port, previewId });
    return { port, path, previewId };
  }
  const clientId = event.clientId || event.resultingClientId;
  const trackedTarget = clientPorts.get(clientId);
  if (trackedTarget) {
    return { ...trackedTarget, path: url.pathname + url.search };
  }
  return void 0;
}
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const target = resolvePreviewTarget(url, event);
  if (!target) return;
  const responsePromise = (async () => {
    const method = event.request.method;
    const headers = Object.fromEntries(event.request.headers.entries());
    const body = method === "GET" || method === "HEAD" ? void 0 : new Uint8Array(await event.request.arrayBuffer());
    try {
      const result = await relay({ port: target.port, path: target.path, method, headers, body, previewId: target.previewId });
      const responseHeaders = { ...NAVIGATION_ISOLATION_HEADERS };
      for (const [name, value] of Object.entries(result.headers)) {
        responseHeaders[name] = Array.isArray(value) ? value.join(", ") : value;
      }
      let responseBody = result.body;
      const contentType = responseHeaders["content-type"];
      const isHtml = typeof contentType === "string" && contentType.toLowerCase().includes("text/html");
      if (isHtml && !responseHeaders["content-encoding"]) {
        const rewritten = rewritePreviewRootUrls(new TextDecoder().decode(result.body), previewBaseForTarget(target));
        responseBody = new TextEncoder().encode(isHtml ? injectPreviewWsBootstrap(rewritten) : rewritten);
        delete responseHeaders["content-length"];
      }
      return new Response(responseBody, { status: result.status, statusText: result.statusMessage, headers: responseHeaders });
    } catch (error) {
      return new Response(`dwc preview relay error: ${String(error)}`, {
        status: 502,
        headers: NAVIGATION_ISOLATION_HEADERS
      });
    }
  })();
  event.respondWith(responsePromise);
  event.waitUntil(responsePromise);
});
//# sourceMappingURL=PreviewServiceWorker.js.map