import CodeBlock from '../components/CodeBlock';
import DocPage from '../components/DocPage';

function CrossOriginIsolation() {
  return (
    <DocPage
      title="Cross-origin isolation"
      lede="The synchronous bridges (fs.*Sync, dwc.shell.exec(), child_process.execFileSync inside guest code) need SharedArrayBuffer, which browsers only expose on a cross-origin-isolated page."
    >
      <p>That means serving your page with these two response headers:</p>
      <CodeBlock>
        {`Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp`}
      </CodeBlock>
      <p>
        Without these headers, <code>@dwc/core</code> still works — it falls back to a slower static-preload path,
        just without the sync bridges.
      </p>

      <h2>With Vite</h2>
      <CodeBlock>
        {`// vite.config.ts
export default defineConfig({
  plugins: [{
    name: "cross-origin-isolation",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        next();
      });
    },
  }],
});`}
      </CodeBlock>

      <h2>Anywhere else</h2>
      <p>
        Any static host or edge function works the same way — just set these two response headers on the page (and
        every resource it embeds cross-origin needs a compatible{' '}
        <code>Cross-Origin-Resource-Policy</code> header, or COEP blocks it).
      </p>
    </DocPage>
  );
}

export default CrossOriginIsolation;
