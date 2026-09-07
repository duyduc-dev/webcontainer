import { bootDWC, DWCError } from "@dwc/core";
import { Terminal } from "@xterm/xterm";
import { loadVendoredNpm } from "./vendorNpm";

function pipeToTerminal(
  stream: ReadableStream<Uint8Array>,
  terminal: Terminal,
): void {
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  void (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      terminal.write(decoder.decode(value));
    }
  })();
}

// Pipes a stream into the terminal (like pipeToTerminal) while resolving as
// soon as a marker substring appears in it, so callers can wait for a guest
// server to report "listening" instead of guessing a fixed delay.
function waitForMarker(
  stream: ReadableStream<Uint8Array>,
  terminal: Terminal,
  marker: string,
): Promise<void> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let resolveFound!: () => void;
  const found = new Promise<void>((resolve) => {
    resolveFound = resolve;
  });
  let seen = false;

  void (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        if (!seen) resolveFound();
        return;
      }
      const text = decoder.decode(value);
      terminal.write(text);
      if (!seen && text.includes(marker)) {
        seen = true;
        resolveFound();
      }
    }
  })();

  return found;
}

// The App component's source, shared verbatim between the server (evaluated
// via `new Function`, given the real require()d React as an argument) and
// the client (embedded directly in a <script> tag, running against React
// loaded from the real npm-installed UMD build below) - ONE definition, so
// server-render and client-hydrate can never drift out of sync with each
// other. Plain React.createElement calls, no JSX (no bundler/transform
// exists to compile it yet - see PROGRESS.md's still-open Vite dev-server
// item). Real React.useState: renderToString() runs it once for the
// initial value same as any single-pass SSR render; hydrateRoot() on the
// client then makes the SAME component live/interactive - clicking the
// button re-renders through React's own reconciler, not a manual DOM write.
const APP_COMPONENT_SOURCE = [
  "var FEATURES = [",
  "  'Real npm install (real registry fetch, real gzip, real tar, real sha512)',",
  "  'Real CommonJS require() resolution through real node_modules',",
  "  'Real ES modules - live bindings, dynamic import(), top-level await',",
  "  'Real http.createServer(), previewed live through a Service Worker relay',",
  "];",
  "",
  "function App() {",
  "  var state = React.useState(0);",
  "  var count = state[0];",
  "  var setCount = state[1];",
  "",
  "  return React.createElement(",
  "    'div',",
  "    { className: 'app' },",
  "    React.createElement('h1', null, 'React, running inside a WebContainer sandbox'),",
  "    React.createElement(",
  "      'p',",
  "      { className: 'subtitle' },",
  "      'Server-rendered by real, npm-installed React via react-dom/server, then hydrated client-side by the SAME component - this button uses real React.useState, not a manual DOM write.',",
  "    ),",
  "    React.createElement(",
  "      'ul',",
  "      null,",
  "      FEATURES.map(function (feature, i) { return React.createElement('li', { key: i }, feature); }),",
  "    ),",
  "    React.createElement(",
  "      'div',",
  "      { className: 'counter' },",
  "      React.createElement('span', { id: 'count' }, String(count)),",
  "      React.createElement(",
  "        'button',",
  "        { onClick: function () { setCount(count + 1); } },",
  "        'useState count: ' + count + ' (click me)',",
  "      ),",
  "    ),",
  "  );",
  "}",
].join("\n");

// The real, npm-installed React server-rendering the page on every request -
// require('react') + require('react-dom/server') exactly as a real Node app
// would, executed by this project's own real vendored `http` on top of the
// sandboxed fs/process runtime. Also serves React's own real UMD builds
// (node_modules/react/umd/react.development.js,
// node_modules/react-dom/umd/react-dom.development.js - both real files
// inside the npm-installed packages, not a CDN) so the SAME component can
// hydrate client-side too. No bundler/dev-server involved (that's the
// still-open next step - see PROGRESS.md: `npm create vite` and Vite's own
// dev server both hit missing-builtin gaps this session found but hasn't
// fully closed yet) - this demo deliberately takes the path that's actually
// fully working today.
const REACT_SERVER_SOURCE = [
  "const http = require('http');",
  "const fs = require('fs');",
  "const React = require('react');",
  "const { renderToString } = require('react-dom/server');",
  "",
  APP_COMPONENT_SOURCE,
  "",
  "const PAGE = (body) => `<!doctype html>",
  "<html>",
  "<head>",
  "<meta charset=\"utf-8\">",
  "<title>React in a WebContainer</title>",
  "<style>",
  "  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 3rem auto; padding: 0 1rem; color: #1a1a1a; }",
  "  h1 { font-size: 1.5rem; }",
  "  .subtitle { color: #555; line-height: 1.5; }",
  "  ul { line-height: 1.8; }",
  "  .counter { margin-top: 2rem; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; display: flex; align-items: center; gap: 1rem; }",
  "  #count { font-size: 1.5rem; font-weight: 600; min-width: 2ch; }",
  "  button { cursor: pointer; padding: 0.5rem 1rem; }",
  "</style>",
  "</head>",
  "<body>",
  "<div id=\"root\">${body}</div>",
  "<script src=\"/react.js\"></script>",
  "<script src=\"/react-dom.js\"></script>",
  "<script>",
  APP_COMPONENT_SOURCE.replace(/`/g, "\\`"),
  "ReactDOM.hydrateRoot(document.getElementById('root'), React.createElement(App));",
  "</script>",
  "</body>",
  "</html>`;",
  "",
  "const server = http.createServer((req, res) => {",
  "  if (req.url === '/react.js') {",
  "    res.writeHead(200, { 'Content-Type': 'application/javascript' });",
  "    res.end(fs.readFileSync(require.resolve('react/umd/react.development.js')));",
  "    return;",
  "  }",
  "  if (req.url === '/react-dom.js') {",
  "    res.writeHead(200, { 'Content-Type': 'application/javascript' });",
  "    res.end(fs.readFileSync(require.resolve('react-dom/umd/react-dom.development.js')));",
  "    return;",
  "  }",
  "  const html = PAGE(renderToString(React.createElement(App)));",
  "  res.writeHead(200, { 'Content-Type': 'text/html' });",
  "  res.end(html);",
  "});",
  "server.listen(4321, () => console.log('[react-server] listening on 4321'));",
  "",
].join("\n");

async function main() {
  // rows is generous on purpose: xterm's DOM only reflects the visible
  // viewport (not full scrollback), and a real npm install prints a lot.
  const terminal = new Terminal({ convertEol: true, rows: 200 });
  terminal.open(document.getElementById("terminal")!);

  try {
    const dwc = await bootDWC();

    dwc.diagnostics.onEvent((event) => {
      console.log("[dwc]", event.type, event.payload);
    });

    // 1) Vendor + boot real npm (see scripts/vendor-npm.mjs + src/vendorNpm.ts).
    const { version: vendoredVersion, fileCount } = await loadVendoredNpm(dwc);
    console.log("[dwc] loaded vendored npm", vendoredVersion, `(${fileCount} files)`);
    terminal.writeln(`[vendor] loaded real npm ${vendoredVersion} (${fileCount} files)`);

    // 2) Real `npm install react react-dom` against the live registry -
    // same real fetch/gzip/tar/sha512 pipeline as every other npm demo in
    // this project, just with a much bigger, real-world dependency tree
    // (react-dom alone pulls in scheduler and friends).
    await dwc.fs.mkdir("/project", { recursive: true });
    const installProc = await dwc.process.spawn("/bin/npm.js", {
      // Pinned to React 18, not @latest (19.x): react-dom/server's newer
      // internals pull in node:async_hooks's AsyncLocalStorage, which needs
      // real V8 async-context propagation this runtime deliberately doesn't
      // fake (see async_hooks.ts) - React 18's synchronous renderToString()
      // predates that dependency.
      argv: ["install", "react@18", "react-dom@18", "--no-audit", "--no-fund", "--loglevel=warn"],
      cwd: "/project",
    });
    pipeToTerminal(installProc.stdout, terminal);
    pipeToTerminal(installProc.stderr, terminal);
    const installExit = await installProc.exit;
    console.log("[dwc] npm install react react-dom exited with code", installExit);
    terminal.writeln(`\r\n[npm install react react-dom] exit=${installExit}`);
    if (installExit !== 0) return;

    const reactPkg = JSON.parse(
      new TextDecoder().decode(await dwc.fs.readFile("/project/node_modules/react/package.json")),
    ) as { version: string };
    terminal.writeln(`[verify] installed react@${reactPkg.version}`);

    // 3) A real guest http.createServer() that require()s the real,
    // just-installed React and server-renders a page with it on every
    // request - the actual "React app" part of this demo.
    await dwc.fs.writeFile("/project/server.js", REACT_SERVER_SOURCE);
    const serverProc = await dwc.process.spawn("/project/server.js", { cwd: "/project" });
    pipeToTerminal(serverProc.stderr, terminal);
    await waitForMarker(serverProc.stdout, terminal, "listening on");

    // 4) Preview it live: Service Worker relay + <iframe id="preview">.
    try {
      await dwc.preview.enable({ swUrl: "/dwc-preview-sw.js" });
      terminal.writeln("[preview] service worker enabled");

      const previewFrame = document.getElementById("preview") as HTMLIFrameElement | null;
      if (previewFrame) {
        previewFrame.src = dwc.preview.url(4321, "/");
        terminal.writeln(`[preview] iframe.src -> ${previewFrame.src}`);
      } else {
        terminal.writeln("[preview] no #preview iframe found in the page");
      }
    } catch (error) {
      console.error("[dwc] preview.enable() failed:", error);
      terminal.writeln(`[preview] enable() failed: ${String(error)}`);
    }
  } catch (error) {
    if (error instanceof DWCError) {
      console.error(`[dwc] boot failed: ${error.code} - ${error.message}`);
      return;
    }
    throw error;
  }
}

main();
