import DocPage from '../components/DocPage';

function StatusPage() {
  return (
    <DocPage title="Status" lede="Pre-1.0, actively built in the open. What's actually true today.">
      <h2>Works today</h2>
      <ul>
        <li>Real npm install against the live registry, including npm itself</li>
        <li>Real CJS + native ESM module loading, live bindings</li>
        <li>
          32 real Node builtins behind <code>require()</code>
        </li>
        <li>Guest HTTP servers, previewed live in an iframe</li>
        <li>
          A synchronous <code>SharedArrayBuffer</code> bridge for <code>fs.*Sync</code> and{' '}
          <code>execFileSync</code>
        </li>
      </ul>

      <h2>Known gaps</h2>
      <ul>
        <li>
          No native binary execution — no <code>esbuild</code>/native addons, no <code>wasi</code> yet
        </li>
        <li>Guest HTTP responses are fully buffered, text-only</li>
        <li>No HMR — WebSocket upgrades aren't interceptable by a Service Worker</li>
        <li>
          <code>dwc.shell.exec()</code> doesn't expose a real exit code
        </li>
        <li>
          <code>dwc.preview.enable()</code> assumes a single top-level host page relaying for a single sandbox
          instance
        </li>
        <li>
          <code>npm install</code> fetches directly from <code>registry.npmjs.org</code> over the network — no
          offline mode or local cache
        </li>
      </ul>

      <p>
        The full, chronological build log — every gap found, every fix verified live — lives in the repository's own{' '}
        <code>PROGRESS.md</code>.
      </p>
    </DocPage>
  );
}

export default StatusPage;
