import { Link } from 'react-router';
import CodeBlock from '../components/CodeBlock';
import DocPage from '../components/DocPage';

function Shell() {
  return (
    <DocPage title="Shell" lede="dwc.shell.exec(line) runs a line to completion and resolves with combined output.">
      <CodeBlock>
        {`const result = await dwc.shell.exec("mkdir -p /project && cd /project");
// { output: string, cwd: string }`}
      </CodeBlock>
      <p>
        Supports <code>&amp;&amp;</code> chaining (stops at the first non-zero exit) and <code>&gt;</code>/
        <code>&gt;&gt;</code> redirection. The underlying exit code isn't exposed through this call — inspect{' '}
        <code>output</code> if a command might fail, or use <code>dwc.process.spawn()</code> for anything where you
        need the real exit code back.
      </p>
      <h2>spawn() — streaming progress</h2>
      <p>
        <code>exec()</code> is fully buffered — nothing comes back until the whole line finishes, which for
        something like <code>npm install</code> can look indistinguishable from a hang. <code>dwc.shell.spawn()</code>{' '}
        is the streaming counterpart: same line semantics (<code>&amp;&amp;</code> chaining, <code>cd</code>,
        PATH-resolved commands), but <code>stdout</code>/<code>stderr</code> arrive as real{' '}
        <code>ReadableStream</code>s as output is produced.
      </p>
      <CodeBlock>
        {`const install = await dwc.shell.spawn("npm install", { cwd: "/my-app" });

const reader = install.stdout.getReader();
const decoder = new TextDecoder();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value)); // progress, as it happens
}

const exitCode = await install.exit;
install.kill(); // stop whatever's currently running in the line's own && chain`}
      </CodeBlock>
      <h2>Built-in commands</h2>
      <p>
        <code>pwd</code>, <code>cd</code>, <code>ls</code>, <code>cat</code>, <code>mkdir [-p]</code>,{' '}
        <code>echo</code>, <code>rm [-r]</code>, <code>mv</code>, <code>true</code>, <code>false</code>.{' '}
        <code>node &lt;script&gt;</code> runs a script the same way <code>dwc.process.spawn()</code> does; any other
        command resolves against <code>/bin/&lt;name&gt;.js</code> on the virtual filesystem (which is how{' '}
        <code>npm</code>/<code>npx</code> become runnable once loaded via <Link to="/docs/npm">dwc.npm</Link>).
      </p>
      <h2>Needs cross-origin isolation</h2>
      <p>
        The shell runs as a real guest process internally and depends on the same synchronous bridges{' '}
        <code>fs.*Sync</code>/<code>child_process.execFileSync</code> do — see{' '}
        <Link to="/docs/cross-origin-isolation">Cross-origin isolation</Link>.
      </p>
    </DocPage>
  );
}

export default Shell;
