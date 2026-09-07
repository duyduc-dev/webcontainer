import { javascript } from '@codemirror/lang-javascript';
import CodeMirror from '@uiw/react-codemirror';
import { bootDWC } from '@dwc/core';
import type { ProcessHandle } from '@dwc/core';
import { useEffect, useRef, useState } from 'react';
import DocPage from '../components/DocPage';

const RESTART_DEBOUNCE_MS = 600;
const STORAGE_KEY = 'dwc-playground-files';
const ENTRY_FILE = 'server.js';

const DEFAULT_FILES: Record<string, string> = {
  [ENTRY_FILE]: `const http = require("http");
const { greeting } = require("./greeting");
let hits = 0;

const server = http.createServer((req, res) => {
  hits++;
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(\`<!doctype html>
<body style="font-family: system-ui; padding: 2rem;">
  <h1>\${greeting}</h1>
  <p>A real Node http.createServer(), running in a Web Worker,
     previewed live below. Requests served: \${hits}.</p>
</body>\`);
});

server.listen(3000, () => {
  console.log("listening on 3000");
});
`,
  'greeting.js': `exports.greeting = "Hello from inside the sandbox";
`,
};

/** Best-effort - localStorage can throw (private browsing, disabled site
 * data) or simply not persist across a reload; either way the demo still
 * works, it just falls back to the example each time. */
const loadStoredFiles = (): Record<string, string> | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>)[ENTRY_FILE] === 'string') {
      return parsed as Record<string, string>;
    }
    return null;
  } catch {
    return null;
  }
};

const storeFiles = (files: Record<string, string>): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {
    // ignore - see loadStoredFiles
  }
};

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
  const filesRef = useRef<Record<string, string>>(DEFAULT_FILES);
  const procRef = useRef<ProcessHandle | null>(null);
  const restartTimerRef = useRef<number | undefined>(undefined);
  const theme = useSystemTheme();

  const [files, setFiles] = useState<Record<string, string>>(() => {
    const initial = loadStoredFiles() ?? DEFAULT_FILES;
    filesRef.current = initial;
    return initial;
  });
  const [activeFile, setActiveFile] = useState(ENTRY_FILE);
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [output, setOutput] = useState('');
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'booting' | 'idle' | 'running' | 'error'>('booting');

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const dwc = bootDWC();
    dwcRef.current = dwc;
    (window as any).__dwc = dwc;
    dwc.diagnostics.onEvent((e) => console.log('[dwc]', e.timestamp, e.type, JSON.stringify(e.payload)));

    dwc.addEventListener('listen', (payload) => {
      console.log('[dwc-host]', Date.now(), 'listen event received, port', (payload as { port: number }).port);
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

    if (restartTimerRef.current !== undefined) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = undefined;
    }

    // Dev-server-style restart: stop whatever's still listening from the
    // previous run before starting the new one, same as `vite dev` killing
    // and re-spawning on a file change rather than leaking the old server.
    procRef.current?.kill();
    procRef.current = null;
    setPreviewSrc(null);

    const thisRun = ++runIdRef.current;
    setStatus('running');
    setOutput('');

    try {
      // Wipe the project directory first, not just overwrite - a deleted
      // file would otherwise keep resolving via require() from a previous
      // run's stale copy still sitting on the virtual filesystem.
      await dwc.fs.rm('/project', { recursive: true }).catch(() => {});
      await dwc.fs.mkdir('/project', { recursive: true });
      await Promise.all(
        Object.entries(filesRef.current).map(([name, content]) => dwc.fs.writeFile(`/project/${name}`, content)),
      );
      const proc = await dwc.process.spawn(`/project/${ENTRY_FILE}`, { cwd: '/project' });
      if (runIdRef.current !== thisRun) {
        proc.kill();
        return;
      }
      procRef.current = proc;

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
        procRef.current = null;
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

  useEffect(
    () => () => {
      if (restartTimerRef.current !== undefined) window.clearTimeout(restartTimerRef.current);
      procRef.current?.kill();
    },
    [],
  );

  const scheduleRestart = () => {
    if (restartTimerRef.current !== undefined) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = undefined;
      run();
    }, RESTART_DEBOUNCE_MS);
  };

  const updateFiles = (next: Record<string, string>) => {
    filesRef.current = next;
    setFiles(next);
    storeFiles(next);
  };

  const handleChange = (value: string) => {
    updateFiles({ ...filesRef.current, [activeFile]: value });
    scheduleRestart();
  };

  const resetToExample = () => {
    updateFiles(DEFAULT_FILES);
    setActiveFile(ENTRY_FILE);
    run();
  };

  const deleteFile = (name: string) => {
    if (name === ENTRY_FILE) return;
    const next = { ...filesRef.current };
    delete next[name];
    updateFiles(next);
    if (activeFile === name) setActiveFile(ENTRY_FILE);
    scheduleRestart();
  };

  const commitNewFile = () => {
    const name = newFileName.trim();
    setAddingFile(false);
    setNewFileName('');
    if (!name || filesRef.current[name] !== undefined) return;
    updateFiles({ ...filesRef.current, [name]: '// new file\nmodule.exports = {};\n' });
    setActiveFile(name);
  };

  const fileNames = Object.keys(files);

  return (
    <DocPage
      title="Playground"
      lede="A real @dwc/core sandbox, booted on this page. Edit any file and it restarts automatically, like a dev server — require('./greeting') resolves between files exactly like it would in your own app, running in a Web Worker and previewed live on the right."
      wide
    >
      <div className="-mx-4 grid grid-cols-1 gap-4 sm:mx-0 lg:grid-cols-2">
        <div className="flex flex-col border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2">
            <span className="font-mono text-[11.5px] tracking-[0.02em] text-[var(--color-text-faint)]">
              /project
            </span>
            <div className="flex items-center gap-2">
              <button
                className="border border-[var(--color-border)] bg-transparent px-3 py-1 font-mono text-[12px] text-[var(--color-text-faint)] hover:text-[var(--color-text)] disabled:opacity-50"
                disabled={status === 'booting'}
                onClick={resetToExample}
                type="button"
              >
                Reset
              </button>
              <button
                className="border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-1 font-mono text-[12px] font-semibold text-[var(--color-accent-ink)] disabled:opacity-50"
                disabled={status === 'booting'}
                onClick={run}
                type="button"
              >
                {status === 'booting' ? 'booting…' : status === 'running' ? 'running' : 'Run now'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 pt-1.5">
            {fileNames.map((name) => (
              <button
                className={`group flex shrink-0 items-center gap-1.5 border-x border-t px-2.5 py-1 font-mono text-[11.5px] ${
                  name === activeFile
                    ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
                    : 'border-transparent text-[var(--color-text-faint)] hover:text-[var(--color-text)]'
                }`}
                key={name}
                onClick={() => setActiveFile(name)}
                type="button"
              >
                {name}
                {name !== ENTRY_FILE && (
                  <span
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteFile(name);
                    }}
                    role="button"
                    tabIndex={-1}
                  >
                    ×
                  </span>
                )}
              </button>
            ))}
            {addingFile ? (
              <input
                autoFocus
                className="w-24 shrink-0 border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 font-mono text-[11.5px] text-[var(--color-text)] outline-none"
                onBlur={commitNewFile}
                onChange={(event) => setNewFileName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitNewFile();
                  if (event.key === 'Escape') {
                    setAddingFile(false);
                    setNewFileName('');
                  }
                }}
                placeholder="name.js"
                value={newFileName}
              />
            ) : (
              <button
                className="shrink-0 px-2 py-1 font-mono text-[13px] text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                onClick={() => setAddingFile(true)}
                title="Add file"
                type="button"
              >
                +
              </button>
            )}
          </div>

          <CodeMirror
            basicSetup={{ foldGutter: false }}
            extensions={[javascript()]}
            height="360px"
            key={activeFile}
            onChange={handleChange}
            style={{ fontSize: 13 }}
            theme={theme}
            value={files[activeFile] ?? ''}
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
        here; everything used in the default example doesn't need them. Your files are saved to this browser
        only (<code>localStorage</code>) — <strong>Reset</strong> brings back the original example.
      </p>
    </DocPage>
  );
}

export default Playground;
