// previewHtmlInject — kept as its own module (rather than inline in
// PreviewServiceWorker.ts) purely so it's unit-testable in isolation:
// PreviewServiceWorker.ts is registered via `navigator.serviceWorker.
// register()` as a CLASSIC script (no `{type: "module"}` - see Preview.ts's
// enable()), and tsup bundles that entry accordingly - a top-level `export`
// on the entry file itself would leave a real `export` statement in the
// built classic-script output, which is a SyntaxError there ("ServiceWorker
// script evaluation failed", confirmed live). A plain `import` of this
// module from PreviewServiceWorker.ts is fine - tsup inlines it (splitting
// is off), so no `import`/`export` survives in the final bundle either way.
import { PREVIEW_WS_BOOTSTRAP_SCRIPT } from "./wsPolyfill";

const HEAD_OPEN_TAG = /<head[^>]*>/i;

/**
 * Rewrites root-relative HTML attribute URLs through a preview route. A
 * preview is served under a host-owned path (for example
 * `/webcontainer/__dwc_preview__/react-vite/5173/`), while its initial HTML
 * often contains `/@vite/client` and `/src/main.jsx`. Keeping those requests
 * under the route also lets links and document navigations retain their
 * preview target when the browser assigns them a new client id.
 *
 * JavaScript source must not be rewritten: Vite's HMR protocol names modules
 * by their guest paths, so changing `import.meta.hot` identifiers would stop
 * its update packets from matching. Non-navigation runtime requests are
 * routed by the Service Worker's client-to-preview map instead.
 */
const rewritePreviewRootUrls = (content: string, previewBase: string): string =>
  content
    .replace(/(\b(?:src|href|action|poster|data)\s*=\s*["'])\/(?!\/)/gi, `$1${previewBase}`);

/** Injects the WebSocket-replacing polyfill (see wsPolyfill.ts) as a
 * classic inline `<script>` right after the opening `<head>` tag, or at the
 * very start of the document if there is none. Safe either way: a classic
 * inline script runs synchronously during HTML parsing regardless of where
 * it sits, ahead of any deferred `type="module"` script - the `<head>`-
 * relative placement is a tidiness choice, not a correctness requirement. */
const injectPreviewWsBootstrap = (html: string): string => {
  const script = `<script>${PREVIEW_WS_BOOTSTRAP_SCRIPT}</script>`;
  const match = HEAD_OPEN_TAG.exec(html);
  if (!match) return script + html;
  const insertAt = match.index + match[0].length;
  return html.slice(0, insertAt) + script + html.slice(insertAt);
};

export { injectPreviewWsBootstrap };
export { rewritePreviewRootUrls };
