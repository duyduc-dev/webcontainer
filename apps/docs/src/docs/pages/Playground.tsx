import { javascript } from '@codemirror/lang-javascript';
import CodeMirror from '@uiw/react-codemirror';
import { bootDWC } from '@dwc/core';
import { useEffect, useRef, useState } from 'react';
import DocPage from '../components/DocPage';

const DEFAULT_CODE = `const http = require("http");
let hits = 0;

const server = http.createServer((req, res) => {
  hits++;
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(\`<!doctype html>
<body style="font-family: system-ui; padding: 2rem;">
  <h1>Hello from inside the sandbox</h1>
  <p>A real Node http.createServer(), running in a Web Worker,
     previewed live below. Requests served: \${hits}.</p>
</body>\`);
});

server.listen(3000, () => {
  console.log("listening on 3000");
});
`;

const useSystemTheme = (): 'light' | 'dark' => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(mql.matches ? 'dark' : 'light');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return theme;
};

function Playground() {
  const dwcRef = useRef<ReturnType<typeof bootDWC> | null>(null);
  const bootedRef = useRef(false);
  const runIdRef = useRef(0);
  const theme = useSystemTheme();

  const [code, setCode] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState('');
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'booting' | 'idle' | 'running' | 'error'>('booting');

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const dwc = bootDWC();
    dwcRef.current = dwc;

    dwc.addEventListener('listen', (payload) => {
      setPreviewSrc(dwc.preview.url((payload as { port: number }).port));
    });

    (async () => {
      try {
        await dwc.ready;
        await dwc.preview.enable({
          swUrl: `${import.meta.env.BASE_URL}dwc-preview-sw.js`,
          scope: import.meta.env.BASE_URL,
        });
        setStatus('idle');
        run();
      } catch (err) {
        setStatus('error');
        setOutput(String(err));
      }
    })();
    // run() is defined below and stable enough for this one-time boot effect -
    // deliberately not in the dependency array to avoid re-running on every
    // code edit (this effect boots the sandbox exactly once).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    const dwc = dwcRef.current;
    if (!dwc) return;

    const thisRun = ++runIdRef.current;
    setStatus('running');
    setOutput('');

    try {
      await dwc.fs.mkdir('/project', { recursive: true });
      await dwc.fs.writeFile('/project/server.js', code);
      const proc = await dwc.process.spawn('/project/server.js', { cwd: '/project' });

      const pipe = async (stream: ReadableStream<Uint8Array>) => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done || runIdRef.current !== thisRun) break;
          setOutput((prev) => prev + decoder.decode(value, { stream: true }));
        }
      };
      pipe(proc.stdout);
      pipe(proc.stderr);

      const exitCode = await proc.exit;
      if (runIdRef.current === thisRun) {
        setOutput((prev) => `${prev}\n[process exited with code ${exitCode}]\n`);
        setStatus('idle');
      }
    } catch (err) {
      if (runIdRef.current === thisRun) {
        setStatus('error');
        setOutput((prev) => `${prev}\n${String(err)}`);
      }
    }
  };

  return (
    <DocPage
      title="Playground"
      lede="A real @dwc/core sandbox, booted on this page. Edit the script and hit Run — it's the same require('http') your own app would use, running in a Web Worker, previewed live on the right."
      wide
    >
      <div className="-mx-4 grid grid-cols-1 gap-4 sm:mx-0 lg:grid-cols-2">
        <div className="flex flex-col border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2">
            <span className="font-mono text-[11.5px] tracking-[0.02em] text-[var(--color-text-faint)]">
              /project/server.js
            </span>
            <button
              className="border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-1 font-mono text-[12px] font-semibold text-[var(--color-accent-ink)] disabled:opacity-50"
              disabled={status === 'booting'}
              onClick={run}
              type="button"
            >
              {status === 'booting' ? 'booting…' : status === 'running' ? 'running' : 'Run'}
            </button>
          </div>
          <CodeMirror
            basicSetup={{ foldGutter: false }}
            extensions={[javascript()]}
            height="360px"
            onChange={(value) => setCode(value)}
            style={{ fontSize: 13 }}
            theme={theme}
            value={code}
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex h-[170px] flex-col border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2">
              <span className="font-mono text-[11.5px] tracking-[0.02em] text-[var(--color-text-faint)]">
                stdout / stderr
              </span>
            </div>
            <pre className="flex-1 overflow-auto px-3.5 py-2 font-mono text-[12px] leading-[1.6] whitespace-pre-wrap text-[var(--color-text-dim)]">
              {output || (status === 'booting' ? 'booting the sandbox…' : '')}
            </pre>
          </div>

          <div className="flex h-[170px] flex-col border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2">
              <span className="font-mono text-[11.5px] tracking-[0.02em] text-[var(--color-text-faint)]">
                preview
              </span>
            </div>
            {previewSrc ? (
              <iframe className="flex-1 bg-white" key={previewSrc} src={previewSrc} title="Live preview" />
            ) : (
              <div className="flex flex-1 items-center justify-center font-mono text-[12px] text-[var(--color-text-faint)]">
                waiting for the server to listen…
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-[13px] text-[var(--color-text-faint)]">
        Runs entirely in your browser — no request leaves this tab except the initial page load. Cross-origin
        isolation isn't enabled on this page, so <code>fs.*Sync</code>/<code>execFileSync</code> aren't available
        here; everything used in the default example doesn't need them.
      </p>
    </DocPage>
  );
}

export default Playground;
