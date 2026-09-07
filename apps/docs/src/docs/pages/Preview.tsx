import CodeBlock from '../components/CodeBlock';
import DocPage from '../components/DocPage';

function Preview() {
  return (
    <DocPage
      title="Preview"
      lede="A guest node process calling server.listen(port) doesn't open a real TCP socket — the kernel remembers which guest Worker owns that port and emits a listen event."
    >
      <CodeBlock>
        {`dwc.addEventListener("listen", ({ port }) => {
  console.log(\`server listening on \${port}\`);
});`}
      </CodeBlock>
      <p>From there you have two ways to actually talk to it.</p>

      <h2>Direct fetch</h2>
      <CodeBlock>
        {`const res = await dwc.preview.fetch(port, "/", { method: "GET" });
// { status, headers, body, bodyEncoding: "utf8" | "base64" }`}
      </CodeBlock>
      <p>
        Good for polling/testing that a server inside the container is responding. Bodies are fully buffered (no
        streaming) and, currently, always <code>utf8</code> — the guest <code>http</code> shim doesn't produce
        binary/base64 responses yet, so serving binary assets (images, fonts, wasm) through preview isn't supported.
      </p>

      <h2>Live iframe preview</h2>
      <CodeBlock>
        {`await dwc.preview.enable({ swUrl: "/dwc-preview-sw.js" });
iframe.src = dwc.preview.url(port); // "/__dwc_preview__/<port>/"`}
      </CodeBlock>
      <p>
        This registers a Service Worker that intercepts the iframe's traffic — including a real dev server's
        root-absolute asset requests (<code>/style.css</code>, <code>/@vite/client</code>, etc., which arrive with no
        prefix at all) — and relays it through <code>dwc.preview.fetch()</code> under the hood.
      </p>
      <p>Two things this requires that can't be automated by the library:</p>
      <ol>
        <li>
          <strong>Serve the Service Worker script yourself</strong>, at (or above) the scope you pass to{' '}
          <code>enable()</code>. <code>navigator.serviceWorker.register()</code> only accepts a same-origin URL.
          Resolve the built file via the <code>@dwc/core/preview-sw</code> export and copy it into wherever your app
          serves static assets from its origin root.
        </li>
        <li>
          <strong>If it isn't served from the actual origin root</strong>, the response needs a{' '}
          <code>Service-Worker-Allowed: /</code> header, or the browser caps the Service Worker's max scope to the
          script's own directory.
        </li>
      </ol>
      <CodeBlock>
        {`// scripts/copy-preview-sw.mjs
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
copyFileSync(require.resolve("@dwc/core/preview-sw"), "public/dwc-preview-sw.js");`}
      </CodeBlock>

      <h2>No real origin isolation</h2>
      <p>
        Preview content runs on your app's own origin, so it isn't isolated from your host page's cookies/storage the
        way a real sandboxed subdomain would be. Wrapping the iframe in <code>sandbox="allow-scripts"</code> without{' '}
        <code>allow-same-origin</code> doesn't help either — that gives the iframe an opaque origin, and an opaque
        origin can't be controlled by a same-origin Service Worker at all, so preview would just stop working. If you
        need genuine isolation, that requires owning a domain with wildcard DNS and an edge worker to serve each
        preview from its own origin.
      </p>
    </DocPage>
  );
}

export default Preview;
