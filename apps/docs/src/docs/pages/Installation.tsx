import { Link } from 'react-router';
import CodeBlock from '../components/CodeBlock';
import DocPage from '../components/DocPage';

function Installation() {
  return (
    <DocPage title="Installation">
      <CodeBlock>{'npm install @dwc/core'}</CodeBlock>
      <p>Then boot it — no configuration required for the basics:</p>
      <CodeBlock>
        {`import { bootDWC } from "@dwc/core";

const dwc = bootDWC();`}
      </CodeBlock>
      <h2>Enable cross-origin isolation (recommended)</h2>
      <p>
        The synchronous bridges (<code>fs.*Sync</code>, <code>dwc.shell.exec()</code>,{' '}
        <code>child_process.execFileSync</code> inside guest code) need <code>SharedArrayBuffer</code>, which browsers
        only expose on a page served with:
      </p>
      <CodeBlock>
        {`Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp`}
      </CodeBlock>
      <p>
        This is optional — without these headers <code>@dwc/core</code> still works, just via a slower fallback and
        without the shell/sync-exec bridges. See <Link to="/docs/cross-origin-isolation">Cross-origin isolation</Link>{' '}
        for how to add them with Vite or any other static host.
      </p>
      <h2>If you want live iframe preview</h2>
      <p>
        Skip this if you only need <code>dwc.fs</code>/<code>dwc.process</code>/<code>dwc.shell</code> with no visual
        preview. See <Link to="/docs/preview">Preview</Link> for the full setup (copying the Service Worker into your
        static output, registering it, pointing an iframe at a port).
      </p>
    </DocPage>
  );
}

export default Installation;
