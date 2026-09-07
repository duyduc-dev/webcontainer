import CodeBlock from '../components/CodeBlock';
import DocPage from '../components/DocPage';

function Process() {
  return (
    <DocPage
      title="Process"
      lede="dwc.process.spawn() runs a script as its own guest process — a fresh module graph, event loop, and require() with real Node builtins."
    >
      <CodeBlock>
        {`const proc = await dwc.process.spawn("/project/server.js", {
  argv: [],
  env: {},
  cwd: "/project",
});

proc.stdout; // ReadableStream<Uint8Array>
proc.stderr; // ReadableStream<Uint8Array>
proc.stdin;  // WritableStream<Uint8Array>
const exitCode = await proc.exit; // Promise<number>`}
      </CodeBlock>
      <p>
        Use this for anything long-running (a server); for a one-shot command,{' '}
        <code>dwc.shell.exec()</code> is simpler. A script that never exits (a server) never resolves{' '}
        <code>proc.exit</code> — that's expected, watch <code>"listen"</code> events instead (see{' '}
        <code>Preview</code>).
      </p>
      <h2>Reading output</h2>
      <CodeBlock>
        {`const reader = proc.stdout.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value));
}`}
      </CodeBlock>
    </DocPage>
  );
}

export default Process;
