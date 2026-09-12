import CodeBlock from '../components/CodeBlock';
import DocPage from '../components/DocPage';

function Npm() {
  return (
    <DocPage
      title="Npm"
      lede="dwc.npm loads a real, unmodified npm CLI into the virtual filesystem and puts npm/npx/pnpm on PATH."
    >
      <p>
        <code>duckwc</code> doesn't ship or pin any particular npm version itself — running real npm inside the
        sandbox means running npm's own unmodified JS source as a guest program, the same way any other script runs.
        <code>dwc.npm</code> is the mechanism for getting that source into the VFS; where the source comes from is up
        to you.
      </p>
      <CodeBlock>
        {`const { version, fileCount } = await dwc.npm.loadFrom("/vendor/npm.json");
// { version: "10.9.2", fileCount: 2400 }

await dwc.shell.exec("npm --version"); // { output: "10.9.2\\n", cwd: "/" }`}
      </CodeBlock>
      <p>
        <code>loadFrom(url)</code> fetches a JSON asset shaped <code>{'{ version, files: { relativePath: contents } }'}</code>,
        mounts it at <code>/usr/lib/node_modules/npm</code>, and writes <code>/bin/npm.js</code>/<code>npx.js</code>/
        <code>pnpm.js</code> shims so the shell's PATH search resolves them. Already have the asset in memory (fetched
        another way, or embedded)? Call <code>dwc.npm.load(asset)</code> directly and skip the fetch.
      </p>
      <h2>Building the asset</h2>
      <p>
        See <code>examples/playground/scripts/vendor-npm.mjs</code> for one way to build a compatible asset: it packs
        a pinned npm release into a flat <code>{'{ path: contents }'}</code> map. Pin whatever version you want — this
        is a build-time choice for your app, not something the library decides for you.
      </p>
      <h2>node-gyp and pnpm</h2>
      <p>
        <code>load()</code> also neutralizes <code>node-gyp</code> (native addons can't run in-browser — it becomes a
        clean no-op instead of failing a package's install lifecycle) and installs a narrow <code>pnpm</code> shim
        that rewrites <code>pnpm i &lt;pkg&gt;</code> into an equivalent <code>npm install</code> call against the same
        vendored CLI — real pnpm isn't vendored, this only covers the one call shape tools like rolldown's own
        WebContainer fallback actually use.
      </p>
    </DocPage>
  );
}

export default Npm;
