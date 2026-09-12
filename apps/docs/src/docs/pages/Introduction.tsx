import { Link } from 'react-router';
import CodeBlock from '../components/CodeBlock';
import DocPage from '../components/DocPage';

function Introduction() {
  return (
    <DocPage
      title="Introduction"
      lede="A WebContainer-style sandbox that runs in the browser: a virtual filesystem, a shell, real node/npm execution against the live npm registry, and live preview of servers started inside it — all in Web Workers, no backend required."
    >
      <p>
        <code>duckwc</code> boots three cooperating Web Workers behind one call — a kernel worker that routes
        requests and owns the process table, an FS worker holding an in-memory virtual filesystem, and a process
        worker per spawned guest program. See <Link to="/#architecture">the process table</Link> on the overview
        page for the full picture.
      </p>
      <h2>Quick start</h2>
      <CodeBlock>
        {`import { bootWC } from "duckwc";

const dwc = bootWC(); // synchronous — no await needed

await dwc.fs.mkdir("/project", { recursive: true });
await dwc.fs.writeFile("/project/hello.txt", "hello world");
await dwc.fs.readFile("/project/hello.txt"); // Uint8Array

const result = await dwc.shell.exec("cd /project && pwd");
// { output: "/project\\n", cwd: "/project" }`}
      </CodeBlock>
      <p>
        <code>await bootWC()</code> still works too — <code>await</code> on a plain object that isn't a Promise just
        resolves to it on the next microtask. Use <code>await dwc.ready</code> if you specifically want to know boot
        succeeded (or why it didn't) without making an actual call.
      </p>
      <h2>Where to go next</h2>
      <ul>
        <li>
          <Link to="/docs/installation">Installation</Link> — adding the package and, optionally, enabling
          cross-origin isolation for the full feature set.
        </li>
        <li>
          <Link to="/docs/filesystem">Filesystem</Link>, <Link to="/docs/npm">Npm</Link>,{' '}
          <Link to="/docs/process">Process</Link>, <Link to="/docs/shell">Shell</Link>, and{' '}
          <Link to="/docs/preview">Preview</Link> — the APIs `bootWC()` returns.
        </li>
        <li>
          <Link to="/docs/node-builtins">Node builtins</Link> — exactly what a guest script's <code>require()</code>{' '}
          can reach.
        </li>
      </ul>
    </DocPage>
  );
}

export default Introduction;
