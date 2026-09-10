// wsPolyfill — the `WebSocket` global replacement injected into every HTML
// response the preview Service Worker serves (see PreviewServiceWorker.ts's
// injectPreviewWsBootstrap). A Service Worker can never intercept a page's
// own `new WebSocket(...)` call (a real, confirmed browser platform
// limitation - unlike `fetch`, there is no equivalent interception event),
// so the only way to route Vite's own HMR client (which does exactly that)
// through this runtime's kernel is to replace `window.WebSocket` itself,
// before Vite's client script ever runs.
//
// This file's exported string is injected as a classic (non-module) inline
// `<script>` - which the HTML spec guarantees runs synchronously during
// parsing, before any `type="module"` script (deferred by default)
// regardless of where each tag sits in the document. That ordering is what
// makes "replace window.WebSocket before Vite's client imports run" work
// without needing careful placement.
//
// Talks to the host page (apis/Preview.ts's `handleIframeMessage`) via
// plain same-origin `postMessage` - the iframe is confirmed same-origin
// with the host page (both live under the app's own origin; see
// previewProtocol.ts), so no cross-origin bridging is needed.
import { PREVIEW_SCOPE_PREFIX } from "../../apis/previewProtocol";

const PREVIEW_WS_BOOTSTRAP_SCRIPT = `(function () {
  if (window.__dwcRealWebSocket) return; // idempotent guard - never double-install
  window.__dwcRealWebSocket = window.WebSocket;

  // Recovered from THIS document's own initial navigation path (still
  // "${PREVIEW_SCOPE_PREFIX}<port>/...") captured eagerly, right now,
  // before any client-side routing (Vite/React Router/etc.) can rewrite
  // location.pathname via the History API - not from the URL passed to
  // the WebSocket constructor, which is robust to whatever hostname/port
  // Vite's own client bundle computes internally.
  var portMatch = /${PREVIEW_SCOPE_PREFIX.replace(/\//g, "\\/")}(\\d+)/.exec(location.pathname);
  var DEFAULT_PORT = portMatch ? Number(portMatch[1]) : null;

  var nextRequestId = 1;
  var pendingByRequestId = new Map();
  var socketsByWsId = new Map();

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
      pendingByRequestId.set(requestId, this);
      window.parent.postMessage(
        {
          type: "dwc:ws-open",
          requestId: requestId,
          port: DEFAULT_PORT,
          path: target.pathname + target.search,
          protocols: protocols == null ? [] : Array.isArray(protocols) ? protocols : [protocols],
        },
        location.origin,
      );
    }

    send(data) {
      if (this.readyState !== DwcWebSocket.OPEN) throw new DOMException("Failed to execute 'send' on 'WebSocket': still in CONNECTING state.", "InvalidStateError");
      window.parent.postMessage({ type: "dwc:ws-send", wsId: this._wsId, data: String(data) }, location.origin);
    }

    close(code, reason) {
      if (this.readyState === DwcWebSocket.CLOSING || this.readyState === DwcWebSocket.CLOSED) return;
      this.readyState = DwcWebSocket.CLOSING;
      window.parent.postMessage({ type: "dwc:ws-close", wsId: this._wsId, code: code, reason: reason }, location.origin);
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
      opened.dispatchEvent(new Event("open"));
    } else if (message.type === "dwc:ws-open-error") {
      var failed = pendingByRequestId.get(message.requestId);
      if (!failed) return;
      pendingByRequestId.delete(message.requestId);
      failed.readyState = DwcWebSocket.CLOSED;
      failed.dispatchEvent(new Event("error"));
      failed.dispatchEvent(new CloseEvent("close", { code: 1006, reason: String(message.error) }));
    } else if (message.type === "dwc:ws-message") {
      var target2 = socketsByWsId.get(message.wsId);
      if (target2) target2.dispatchEvent(new MessageEvent("message", { data: message.data }));
    } else if (message.type === "dwc:ws-close") {
      var closing = socketsByWsId.get(message.wsId);
      if (!closing) return;
      socketsByWsId.delete(message.wsId);
      closing.readyState = DwcWebSocket.CLOSED;
      closing.dispatchEvent(new CloseEvent("close", { code: message.code, reason: message.reason || "" }));
    }
  });

  window.WebSocket = DwcWebSocket;
})();`;

export { PREVIEW_WS_BOOTSTRAP_SCRIPT };
