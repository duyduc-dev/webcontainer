// Guest-side files written into a scaffolded `--template react-ts` project so
// it runs inside duckwc.
//
// Why this template does not just reuse the vanilla recipe's Vite 8/Rolldown
// setup: React ships CommonJS, so a normal `import { useState } from "react"`
// only resolves in a Vite dev server after the dependency optimizer has
// pre-bundled it to ESM. That optimizer is exactly the path this runtime
// can't run today - Rolldown's WASI binding traps (`RuntimeError:
// unreachable` / `operation does not support unaligned accesses`, a
// confirmed upstream napi-rs tokio-runtime lifecycle bug; see PROGRESS.md
// items 9, 13 and 13.1, including a Vite 8 + @vitejs/plugin-react attempt
// that trapped before the server ever listened).
//
// So this follows the one React recipe this repo has verified live instead
// (apps/docs' React + Vite example): Vite 7 with esbuild/rollup aliased to
// their real WASM builds, React's own UMD browser build loaded by a plain
// <script> tag, and the bare `react` specifiers aliased to tiny local ESM
// modules that re-export that global. The dependency optimizer then has
// nothing left to pre-bundle, and the scaffolded sources keep their ordinary
// imports - no edits to App.tsx/main.tsx at all.
//
// The one thing this gives up is React Fast Refresh, which lives in
// @vitejs/plugin-react: editing a component reaches the preview as Vite's
// full page reload instead of a state-preserving hot swap.

// React 18, not 19: React stopped publishing UMD builds after 18, and the
// UMD build is what lets this sidestep the CJS optimizer entirely.
export const REACT_VERSION = "18.3.1";
export const VITE_VERSION = "7.3.6";
export const BABEL_STANDALONE_VERSION = "7.25.2";

const SHIM_DIR = "src/duckwc-react";

const MISSING_UMD_ERROR =
  "throw new Error(\"duckwc: the React UMD build did not load - check the <script> tags in index.html.\");";

// The full React 18 named-export surface. A name React drops in a future
// patch release simply reads as `undefined` here rather than breaking the
// module, which is the same thing a real bundler's interop would produce.
const REACT_SHIM = `const React = globalThis.React;
if (!React) ${MISSING_UMD_ERROR}

export default React;
export const {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createFactory,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
} = React;
`;

const REACT_DOM_SHIM = `const ReactDOM = globalThis.ReactDOM;
if (!ReactDOM) ${MISSING_UMD_ERROR}

export default ReactDOM;
export const {
  createPortal,
  findDOMNode,
  flushSync,
  hydrate,
  render,
  unmountComponentAtNode,
  version,
} = ReactDOM;
`;

// React 18's UMD bundle exposes createRoot/hydrateRoot on the single
// ReactDOM global; there is no separate react-dom/client UMD file to load.
const REACT_DOM_CLIENT_SHIM = `const ReactDOM = globalThis.ReactDOM;
if (!ReactDOM) ${MISSING_UMD_ERROR}

export const createRoot = ReactDOM.createRoot;
export const hydrateRoot = ReactDOM.hydrateRoot;
export default { createRoot, hydrateRoot };
`;

// React 18's UMD build predates the automatic JSX runtime's own entry point,
// so rebuild jsx()/jsxs() on top of createElement. createElement pulls `key`
// out of the props object itself and keeps `props.children` untouched when no
// variadic children are passed, which is exactly the automatic runtime's
// calling convention.
const JSX_RUNTIME_SHIM = `const React = globalThis.React;
if (!React) ${MISSING_UMD_ERROR}

export const Fragment = React.Fragment;

export function jsx(type, config, maybeKey) {
  const props = { ...config };
  if (maybeKey !== undefined) props.key = maybeKey;
  return React.createElement(type, props);
}

export const jsxs = jsx;
export const jsxDEV = jsx;
`;

export const REACT_TS_SHIM_DIR = SHIM_DIR;

export const REACT_TS_SHIMS: Record<string, string> = {
  "react.js": REACT_SHIM,
  "react-dom.js": REACT_DOM_SHIM,
  "react-dom-client.js": REACT_DOM_CLIENT_SHIM,
  "jsx-runtime.js": JSX_RUNTIME_SHIM,
};

// `resolve.alias` is prefix-matched in declaration order, so the more
// specific subpaths have to be declared before their own package name.
export function reactTsViteConfig(projectPath: string): string {
  const shims = `${projectPath}/${SHIM_DIR}`;

  return `import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const UMD_BUILDS = [
  ["${projectPath}/node_modules/react/umd/react.development.js", "${projectPath}/public/react.development.js"],
  ["${projectPath}/node_modules/react-dom/umd/react-dom.development.js", "${projectPath}/public/react-dom.development.js"],
];

export default {
  // Vite's own esbuild transform is off: the plugin below handles TypeScript
  // and JSX with @babel/standalone instead, so no esbuild service ever has to
  // start inside this sandbox.
  esbuild: false,
  // With every React specifier aliased to a local module, there are no bare
  // dependencies left to pre-bundle - which is the point (see the notes in
  // Studio's reactTsTemplate.ts).
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
  resolve: {
    alias: {
      "react/jsx-dev-runtime": "${shims}/jsx-runtime.js",
      "react/jsx-runtime": "${shims}/jsx-runtime.js",
      "react-dom/client": "${shims}/react-dom-client.js",
      "react-dom": "${shims}/react-dom.js",
      react: "${shims}/react.js",
    },
  },
  plugins: [
    {
      // React's UMD builds only exist under node_modules, and index.html
      // loads them as plain scripts from Vite's public directory. Copying
      // them here keeps that true for both \`vite dev\` and \`vite build\`
      // (public/ is copied into dist), with no separate install step to keep
      // in sync. It has to happen in \`config\` rather than \`buildStart\`: the
      // dev server snapshots public/'s file list once while starting up and
      // serves nothing that was not in that snapshot, and \`buildStart\` runs
      // after it.
      name: "duckwc-react-umd",
      config() {
        mkdirSync("${projectPath}/public", { recursive: true });
        for (const [from, to] of UMD_BUILDS) {
          if (existsSync(from)) copyFileSync(from, to);
        }
      },
    },
    {
      name: "duckwc-react-ts",
      enforce: "pre",
      async transform(code, id) {
        const file = id.split("?")[0];
        if (!/\\.[cm]?tsx?$/.test(file)) return null;
        if (file.endsWith(".d.ts") || file.includes("/node_modules/")) return null;

        // @babel/standalone bundles preset-typescript and preset-react for
        // browser runtimes; @babel/core resolves its own plugins through
        // Node's loader, which this sandbox does not provide.
        const babelModule = await import("@babel/standalone");
        const babel = babelModule.default ?? babelModule;
        const result = babel.transform(code, {
          filename: file,
          presets: [
            ["react", { runtime: "automatic" }],
            ["typescript", { allExtensions: true, isTSX: file.endsWith("x") }],
          ],
          sourceMaps: true,
        });

        return result ? { code: result.code ?? code, map: result.map } : null;
      },
    },
  ],
};
`;
}

// React's UMD builds are plain browser scripts, loaded ahead of the module
// entry so the shims above always find their globals.
export const REACT_TS_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
    <script src="/react.development.js"></script>
    <script src="/react-dom.development.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
