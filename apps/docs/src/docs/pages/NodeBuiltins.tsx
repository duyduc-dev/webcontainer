import DocPage from '../components/DocPage';
import Tag from '../../components/Tag';

const VENDORED = ['stream', 'buffer', 'events', 'http', 'https', 'http2', 'crypto', 'zlib', 'async_hooks'];
const HAND_WRITTEN = [
  'fs',
  'fs/promises',
  'path',
  'util',
  'os',
  'url',
  'querystring',
  'string_decoder',
  'module',
  'assert',
  'readline',
  'perf_hooks',
  'constants',
  'v8',
  'tty',
  'net',
  'dns',
  'tls',
  'timers/promises',
];

function NodeBuiltins() {
  return (
    <DocPage
      title="Node builtins"
      lede="Guest code (dwc.process.spawn(), node <script> in the shell, or npm install's own dependency tree) gets a real CommonJS loader and real native ES module support, with require()/import resolving:"
    >
      <h2>Real vendored Node source</h2>
      <div className="flex flex-wrap gap-1.5">
        {VENDORED.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>

      <h2>Hand-written, spec-accurate</h2>
      <div className="flex flex-wrap gap-1.5">
        {HAND_WRITTEN.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>
      <p>
        Including <code>util.promisify</code>, <code>util.styleText</code>, <code>util.parseEnv</code>, and{' '}
        <code>module.createRequire</code>/<code>builtinModules</code>.
      </p>

      <h2>child_process</h2>
      <p>
        <code>spawn</code>/<code>exec</code>/<code>execFile</code> (async) and a genuinely synchronous{' '}
        <code>execFileSync</code> (a real <code>SharedArrayBuffer</code>/<code>Atomics</code> bridge — needs{' '}
        cross-origin isolation). <code>spawnSync</code>/<code>execSync</code> are not implemented.
      </p>

      <h2>vm</h2>
      <p>
        Only <code>runInThisContext()</code> — real Node semantics (shares the caller's own global scope, not an
        isolated sandbox). <code>runInNewContext</code>/<code>createContext</code>/<code>Script</code> are not
        implemented; there is no way to fake real V8 context isolation in userland JS.
      </p>

      <h2>worker_threads</h2>
      <p>
        Real <code>MessageChannel</code>/<code>MessagePort</code> (a native Web API, with Node's{' '}
        <code>.ref()</code>/<code>.unref()</code> added as no-ops). <code>new Worker(...)</code> throws a clear
        "not implemented" error rather than faking in-VM thread execution.
      </p>

      <h2>Not implemented</h2>
      <p>
        <code>cluster</code>, <code>dgram</code>, <code>wasi</code>.
      </p>

      <h2>npm install</h2>
      <p>
        <code>npm install</code>/<code>npm install &lt;pkg&gt;</code> inside a guest process resolves real packages
        from <code>registry.npmjs.org</code> (full semver ranges, real tarball extraction, real integrity checks)
        into <code>node_modules</code> on the virtual filesystem — this is genuinely how a real, unmodified npm CLI
        itself runs inside the sandbox.
      </p>
    </DocPage>
  );
}

export default NodeBuiltins;
