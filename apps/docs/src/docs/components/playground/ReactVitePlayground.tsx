import { javascript } from '@codemirror/lang-javascript';
import CodeMirror from '@uiw/react-codemirror';
import { useEffect, useRef, useState } from 'react';
import { getPlaygroundWC } from './playgroundWC';

const REACT_PROJECT_DIR = '/react-vite-app';
const REACT_ENTRY_FILE = `${REACT_PROJECT_DIR}/src/App.jsx`;
const REACT_MAIN_FILE = `${REACT_PROJECT_DIR}/src/main.jsx`;
const RESTART_DEBOUNCE_MS = 600;

type ReactStatus = 'idle' | 'initializing' | 'installing' | 'starting' | 'ready' | 'error';
type ShellHandle = Awaited<ReturnType<ReturnType<typeof getPlaygroundWC>['shell']['spawn']>>;

function waitForListen(
  dwc: ReturnType<typeof getPlaygroundWC>,
  port: number,
  timeoutMs = 60_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error(`timed out waiting for a guest server on port ${port}`));
    }, timeoutMs);
    const unsubscribe = dwc.addEventListener('listen', (event: { port?: unknown }) => {
      if (event.port !== port) return;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
}

function ReactVitePlayground() {
  const dwcRef = useRef<ReturnType<typeof getPlaygroundWC> | null>(null);
  const devRef = useRef<ShellHandle | null>(null);
  const runIdRef = useRef(0);
  const writeTimerRef = useRef<number | undefined>(undefined);
  const [source, setSource] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<ReactStatus>('idle');
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  useEffect(
    () => () => {
      if (writeTimerRef.current !== undefined) window.clearTimeout(writeTimerRef.current);
      devRef.current?.kill();
    },
    [],
  );

  const pipeOutput = (
    stream: ReadableStream<Uint8Array>,
    thisRun: number,
    readyMarker?: string,
  ): Promise<void> => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let trailingText = '';

      const append = (text: string) => {
        if (!text || runIdRef.current !== thisRun) return;
        setOutput((previous) => previous + text);
        if (!readyMarker || settled) return;

        const combined = trailingText + text;
        if (combined.includes(readyMarker)) {
          settled = true;
          resolve();
          return;
        }
        trailingText = combined.slice(-(readyMarker.length - 1));
      };

      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              append(decoder.decode());
              if (!settled) {
                settled = true;
                if (readyMarker) reject(new Error(`Vite exited before printing ${JSON.stringify(readyMarker)}`));
                else resolve();
              }
              return;
            }
            append(decoder.decode(value, { stream: true }));
          }
        } catch (error) {
          if (!settled) {
            settled = true;
            reject(error);
          }
        } finally {
          reader.releaseLock();
        }
      })();
    });
  };

  const initialize = async () => {
    const thisRun = ++runIdRef.current;
    devRef.current?.kill();
    devRef.current = null;
    setOutput('[npm] Loading npm…\n');
    setPreviewSrc(null);
    setSource(null);
    setStatus('initializing');

    try {
      let dwc = dwcRef.current;
      if (!dwc) {
        dwc = getPlaygroundWC();
        dwcRef.current = dwc;
      }

      await dwc.ready;
      if (runIdRef.current !== thisRun) return;

      const npm = await dwc.npm.install('10.9.2');
      if (runIdRef.current !== thisRun) return;
      setOutput((previous) => `${previous}[npm] Ready: ${npm.version}\n`);

      await dwc.fs.rm(REACT_PROJECT_DIR, { recursive: true }).catch(() => {});
      const scaffold = await dwc.shell.exec('npm create vite@7.0.0 react-vite-app -- --template react');
      if (runIdRef.current !== thisRun) return;
      setOutput((previous) => `${previous}${scaffold.output}`);

      const packageJsonPath = `${REACT_PROJECT_DIR}/package.json`;
      const packageJson = JSON.parse(
        new TextDecoder().decode(await dwc.fs.readFile(packageJsonPath)),
      ) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        overrides?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      packageJson.devDependencies = {
        '@babel/standalone': '7.25.2',
        vite: '7.3.6',
      };
      packageJson.dependencies = {
        react: '18.3.1',
        'react-dom': '18.3.1',
      };
      packageJson.overrides = {
        ...packageJson.overrides,
        esbuild: 'npm:esbuild-wasm@0.25.0',
        // Vite 7 resolves Rollup's parser while booting its dev server. The
        // WASM build keeps that parser browser-compatible.
        rollup: 'npm:@rollup/wasm-node@4.43.0',
      };
      packageJson.scripts = { ...packageJson.scripts, dev: 'vite --configLoader native' };
      await dwc.fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
      await dwc.fs.writeFile(
        `${REACT_PROJECT_DIR}/vite.config.js`,
        `import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Use Babel for JSX because Vite's native esbuild binary is not available
    // in a browser-hosted runtime.
    {
      name: "duckwc-browser-safe-vite",
      config() {
        return {
          esbuild: false,
          optimizeDeps: {
            noDiscovery: true,
          },
        };
      },
    },
    {
      name: "duckwc-react-jsx-pretransform",
      enforce: "pre",
      async transform(code, id) {
        if (!/\\.jsx$/.test(id) || id.includes("/node_modules/")) return null;

        // @babel/standalone packages the JSX transform for browser runtimes.
        // The regular @babel/core package assumes Node's full module loader.
        const babelModule = await import("@babel/standalone");
        const babel = babelModule.default ?? babelModule;
        const result = babel.transform(code, {
          filename: id,
          plugins: [["transform-react-jsx", { runtime: "classic" }]],
          sourceMaps: true,
        });
        return result ? { code: result.code ?? code, map: result.map } : null;
      },
    },
  ],
});
`,
      );

      setStatus('installing');
      setOutput(
        (previous) =>
          `${previous}[vite] Using Vite 7 with browser-compatible esbuild and Rollup builds.\n[install] Resolving and downloading dependencies…\n`,
      );
      const install = await dwc.shell.spawn(
        'npm install --loglevel=info --foreground-scripts',
        { cwd: REACT_PROJECT_DIR },
      );
      const installOutput = [
        pipeOutput(install.stdout, thisRun),
        pipeOutput(install.stderr, thisRun),
      ];
      const installExit = await install.exit;
      await Promise.all(installOutput);
      if (runIdRef.current !== thisRun) return;
      if (installExit !== 0) throw new Error(`npm install exited with code ${installExit}`);

      // React's published UMD builds are browser-native scripts. Serving them
      // from Vite's public directory avoids Vite's CJS dependency optimizer,
      // while keeping both the React runtime and the app entirely local to
      // this sandbox.
      const [reactUmd, reactDomUmd] = await Promise.all([
        dwc.fs.readFile(`${REACT_PROJECT_DIR}/node_modules/react/umd/react.development.js`),
        dwc.fs.readFile(`${REACT_PROJECT_DIR}/node_modules/react-dom/umd/react-dom.development.js`),
      ]);
      await Promise.all([
        dwc.fs.writeFile(`${REACT_PROJECT_DIR}/public/react.development.js`, reactUmd),
        dwc.fs.writeFile(`${REACT_PROJECT_DIR}/public/react-dom.development.js`, reactDomUmd),
        dwc.fs.writeFile(
          `${REACT_PROJECT_DIR}/index.html`,
          `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React + Vite</title>
    <script src="/react.development.js"></script>
    <script src="/react-dom.development.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
        ),
        dwc.fs.writeFile(
          REACT_MAIN_FILE,
          `import './App.css';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
`,
        ),
        dwc.fs.writeFile(
          `${REACT_PROJECT_DIR}/src/App.jsx`,
          `const { useState } = React;

function App() {
  const [count, setCount] = useState(0);

  return (
    <main>
      <h1>Vite + React</h1>
      <p>React runs locally in this duckwc sandbox.</p>
      <button onClick={() => setCount((value) => value + 1)} type="button">
        count is {count}
      </button>
    </main>
  );
}

export default App;
`,
        ),
      ]);

      // The esbuild-wasm Node entry starts a Go/WASM service with Node
      // child-process semantics. Vite still uses esbuild.transform() for a few
      // plain JavaScript modules, so route that API through esbuild-wasm's
      // browser entry and its compiled module instead.
      await dwc.fs.writeFile(
        `${REACT_PROJECT_DIR}/node_modules/esbuild/lib/main.js`,
        `"use strict";
const fs = require("fs");
const path = require("path");
const browser = require("./browser.js");
let startup;
const ensureService = () => {
  if (!startup) {
    const bytes = fs.readFileSync(__dirname + "/../esbuild.wasm");
    startup = WebAssembly.compile(bytes).then((wasmModule) => browser.initialize({ wasmModule }));
  }
  return startup;
};
const withService = (method) => (...args) => ensureService().then(() => method(...args));
const loaderFor = (file) => {
  const extension = path.extname(file).slice(1);
  return ["js", "jsx", "ts", "tsx", "css", "json"].includes(extension) ? extension : "js";
};
const reactEntries = {
  react: "node_modules/react/index.js",
  "react-dom": "node_modules/react-dom/index.js",
  "react-dom/client": "node_modules/react-dom/client.js",
  "react/jsx-runtime": "node_modules/react/jsx-runtime.js",
  "react/jsx-dev-runtime": "node_modules/react/jsx-dev-runtime.js",
  "react-dom_client": "node_modules/react-dom/client.js",
  "react_jsx-runtime": "node_modules/react/jsx-runtime.js",
  "react_jsx-dev-runtime": "node_modules/react/jsx-dev-runtime.js",
  scheduler: "node_modules/scheduler/index.js",
};
const vfsPlugin = {
  name: "duckwc-vfs",
  setup(build) {
    build.onResolve({ filter: /^(react|react-dom|react-dom_client|react_jsx-runtime|react_jsx-dev-runtime|scheduler)(?:\\/.*)?$/ }, (args) => {
      const entry = reactEntries[args.path];
      return entry ? { path: path.resolve(process.cwd(), entry) } : null;
    });
    build.onResolve({ filter: /^\\.+\\// }, (args) => ({
      path: path.resolve(args.resolveDir, args.path),
    }));
    build.onResolve({ filter: /^\\// }, (args) => ({ path: args.path }));
    build.onLoad({ filter: /^\\// }, (args) => {
      try {
        return {
          contents: fs.readFileSync(args.path, "utf8"),
          loader: loaderFor(args.path),
          resolveDir: path.dirname(args.path),
        };
      } catch {
        return null;
      }
    });
  },
};
const resolveEntryPoint = (entry, cwd) => {
  if (typeof entry === "string") {
    const reactEntry = reactEntries[entry];
    return path.isAbsolute(entry) ? entry : path.resolve(cwd, reactEntry || entry);
  }
  if (entry && typeof entry === "object" && typeof entry.in === "string") {
    return { ...entry, in: resolveEntryPoint(entry.in, cwd) };
  }
  return entry;
};
const normalizeEntryPoints = (entryPoints, cwd) => {
  if (Array.isArray(entryPoints) && entryPoints.every((entry) => typeof entry === "string")) {
    return Object.fromEntries(entryPoints.map((entry) => [entry, resolveEntryPoint(entry, cwd)]));
  }
  if (Array.isArray(entryPoints)) return entryPoints.map((entry) => resolveEntryPoint(entry, cwd));
  if (entryPoints && typeof entryPoints === "object") {
    return Object.fromEntries(
      Object.entries(entryPoints).map(([name, entry]) => [name, resolveEntryPoint(entry, cwd)]),
    );
  }
  return entryPoints;
};
const withVfs = (options) => ({
  ...options,
  entryPoints: normalizeEntryPoints(options.entryPoints, options.absWorkingDir || process.cwd()),
  plugins: [vfsPlugin, ...(options.plugins || [])],
});
const build = (options) => withService(browser.build)(withVfs(options));
const context = (options) => withService(browser.context)(withVfs(options));
const unavailableSync = () => { throw new Error("duckwc: esbuild's synchronous APIs are unavailable in this browser sandbox."); };
module.exports = {
  version: browser.version,
  build,
  buildSync: unavailableSync,
  context,
  transform: withService(browser.transform),
  transformSync: unavailableSync,
  analyzeMetafile: withService(browser.analyzeMetafile),
  analyzeMetafileSync: unavailableSync,
  formatMessages: withService(browser.formatMessages),
  formatMessagesSync: unavailableSync,
  initialize: ensureService,
  stop: () => browser.stop(),
};
`,
      );

      setStatus('starting');
      // Register before spawning: Vite can print its banner before DWC has
      // completed the port-pipe registration that makes preview reachable.
      const viteListening = waitForListen(dwc, 5173);
      const dev = await dwc.shell.spawn('npm run dev', { cwd: REACT_PROJECT_DIR });
      devRef.current = dev;
      const devReady = pipeOutput(dev.stdout, thisRun, 'Local:');
      void pipeOutput(dev.stderr, thisRun);
      await Promise.all([devReady, viteListening]);
      if (runIdRef.current !== thisRun) {
        dev.kill();
        return;
      }

      await dwc.preview.enable({
        swUrl: `${import.meta.env.BASE_URL}dwc-preview-sw.js`,
        scope: import.meta.env.BASE_URL,
      });
      if (runIdRef.current !== thisRun) return;
      setPreviewSrc(dwc.preview.url(5173, '/'));
      setSource(new TextDecoder().decode(await dwc.fs.readFile(REACT_ENTRY_FILE)));
      setStatus('ready');
    } catch (error) {
      if (runIdRef.current === thisRun) {
        devRef.current = null;
        setStatus('error');
        setOutput((previous) => `${previous}\n${String(error)}\n`);
      }
    }
  };

  const handleChange = (value: string) => {
    setSource(value);
    if (writeTimerRef.current !== undefined) window.clearTimeout(writeTimerRef.current);
    const thisRun = runIdRef.current;
    writeTimerRef.current = window.setTimeout(() => {
      writeTimerRef.current = undefined;
      const dwc = dwcRef.current;
      if (!dwc || runIdRef.current !== thisRun) return;
      void dwc.fs.writeFile(REACT_ENTRY_FILE, value).catch((error: unknown) => {
        if (runIdRef.current === thisRun) {
          setOutput((previous) => `${previous}\n${String(error)}\n`);
        }
      });
    }, RESTART_DEBOUNCE_MS);
  };

  return (
    <section className="mt-6 border-t border-[var(--color-border)] pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-[20px] font-bold">React + Vite example</h2>
          <p className="mt-1 max-w-[680px] text-[14px] text-[var(--color-text-dim)]">
            Creates a Vite 7 React project, installs its dependencies with live npm output, then runs
            <code>npm run dev</code> in the Docs page&apos;s shared duckwc sandbox. Edit <code>App.jsx</code> to use Vite HMR in
            the preview.
          </p>
        </div>
        <button
          className="border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-1.5 font-mono text-[12px] font-semibold text-[var(--color-accent-ink)] disabled:opacity-50"
          disabled={status === 'initializing' || status === 'installing' || status === 'starting'}
          onClick={() => void initialize()}
          type="button"
        >
          {status === 'idle'
            ? 'Initialize React'
            : status === 'initializing'
              ? 'loading npm…'
              : status === 'installing'
                ? 'installing…'
                : status === 'starting'
                  ? 'starting Vite…'
                  : status === 'ready'
                    ? 'Reinitialize'
                    : 'Try again'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2 font-mono text-[11.5px] tracking-[0.02em] text-[var(--color-text-faint)]">
            /react-vite-app/src/App.jsx
          </div>
          {source === null ? (
            <div className="flex h-[360px] items-center justify-center px-6 text-center font-mono text-[12px] text-[var(--color-text-faint)]">
              Initialize the React example to load the Vite starter source.
            </div>
          ) : (
            <CodeMirror
              basicSetup={{ foldGutter: false }}
              extensions={[javascript({ jsx: true })]}
              height="360px"
              onChange={handleChange}
              style={{ fontSize: 13 }}
              theme={theme}
              value={source}
            />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex h-[140px] flex-col border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2 font-mono text-[11.5px] tracking-[0.02em] text-[var(--color-text-faint)]">
              npm / Vite output
            </div>
            <pre className="flex-1 overflow-auto px-3.5 py-2 font-mono text-[12px] leading-[1.6] whitespace-pre-wrap text-[var(--color-text-dim)]">
              {output || 'Initialize the project to stream npm and Vite output.'}
            </pre>
          </div>

          <div className="flex h-[260px] flex-col border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2 font-mono text-[11.5px] tracking-[0.02em] text-[var(--color-text-faint)]">
              React preview
            </div>
            {previewSrc ? (
              <iframe className="flex-1 bg-white" key={previewSrc} src={previewSrc} title="React Vite preview" />
            ) : (
              <div className="flex flex-1 items-center justify-center px-6 text-center font-mono text-[12px] text-[var(--color-text-faint)]">
                {status === 'error' ? 'The React example did not start; inspect the output and try again.' : 'The preview appears after Vite is ready.'}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[13px] text-[var(--color-text-faint)]">
        This optional example pins Vite 7 because its WASM-compatible toolchain runs reliably in the browser sandbox.
        Its first initialization downloads packages from npm; subsequent edits write directly to the sandbox so Vite
        can apply HMR.
      </p>
    </section>
  );
}

export default ReactVitePlayground;
