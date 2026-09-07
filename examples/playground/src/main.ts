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

// A real, separately-vendored program (npm) can print an arbitrarily long
// stack trace on failure - streaming that raw into xterm has been observed
// to hang the tab's main thread, so npm's own output is always buffered +
// truncated rather than piped straight through like the other demos.
async function readAllTruncated(
  stream: ReadableStream<Uint8Array>,
  limit = 4000,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value);
    if (text.length > limit) return `${text.slice(0, limit)}\n...[truncated]`;
  }
}

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
    // This fetches the pre-packed real npm@10.9.2 asset and mounts it into
    // the guest VFS at /usr/lib/node_modules/npm, stubs node-gyp (native
    // addon builds can't run in-browser), and wires /bin/npm.js + /bin/npx.js
    // as thin require() shims onto the real bin/npm-cli.js / bin/npx-cli.js.
    const { version: vendoredVersion, fileCount } = await loadVendoredNpm(dwc);
    console.log(
      "[dwc] loaded vendored npm",
      vendoredVersion,
      `(${fileCount} files)`,
    );
    terminal.writeln(
      `[vendor] loaded real npm ${vendoredVersion} (${fileCount} files)`,
    );

    // 2) `npm --version` - the cheapest possible smoke test that the real
    // CLI boots at all (engine validation + top-level Npm construction,
    // nothing touching the registry or installers yet).
    const versionProc = await dwc.process.spawn("/bin/npm.js", {
      argv: ["--version"],
    });
    const [versionStdout, versionStderr] = await Promise.all([
      readAllTruncated(versionProc.stdout),
      readAllTruncated(versionProc.stderr),
    ]);
    const versionExit = await versionProc.exit;
    console.log("[dwc] npm --version exit", versionExit, versionStdout);
    terminal.writeln(
      `[npm --version] exit=${versionExit} stdout=${JSON.stringify(versionStdout)}`,
    );
    if (versionStderr) {
      terminal.writeln(`[npm --version] stderr=${JSON.stringify(versionStderr)}`);
    }

    // 3) A real `npm install <pkg>` end-to-end: real registry fetch, real
    // gzip decompression, real tar extraction, real sha512 integrity checks
    // (see PROGRESS.md, section 1). Run in its own project directory so the
    // resulting package.json/package-lock.json/node_modules are easy to
    // inspect afterwards. npm creates package.json itself if none exists.
    await dwc.fs.mkdir("/project", { recursive: true });

    const installProc = await dwc.process.spawn("/bin/npm.js", {
      // --no-audit/--no-fund: without these, npm makes extra post-install
      // network calls (registry audit endpoint, funding-info lookup) after
      // printing its install summary - vendor-npm.mjs's own known-good
      // `npm install npm@...` call already disables both for exactly this
      // reason. Omitting them here was observed to hang the guest process
      // indefinitely right after "added 1 package in Ns" (never exits),
      // presumably because one of those extra requests never settles.
      argv: ["install", "left-pad", "--no-audit", "--no-fund", "--loglevel=warn"],
      cwd: "/project",
    });
    pipeToTerminal(installProc.stdout, terminal);
    pipeToTerminal(installProc.stderr, terminal);
    const installExit = await installProc.exit;
    console.log("[dwc] npm install left-pad exited with code", installExit);
    terminal.writeln(`\r\n[npm install left-pad] exit=${installExit}`);

    // 4) Verify what landed on disk: package.json, package-lock.json, and
    // the installed package's own files, all written by the REAL npm CLI
    // running on top of this project's own fs/net/http runtime.
    const packageJson = await dwc.fs.readFile("/project/package.json");
    console.log(
      "[dwc] /project/package.json ->",
      new TextDecoder().decode(packageJson),
    );

    const hasLockfile = await dwc.fs.exists("/project/package-lock.json");
    console.log("[dwc] /project/package-lock.json exists ->", hasLockfile);
    terminal.writeln(`[verify] package-lock.json exists -> ${hasLockfile}`);

    const nodeModulesEntries = await dwc.fs.readdir("/project/node_modules");
    console.log("[dwc] /project/node_modules ->", nodeModulesEntries);
    terminal.writeln(`[verify] node_modules -> ${nodeModulesEntries.join(", ")}`);

    const leftPadPackageJson = await dwc.fs.readFile(
      "/project/node_modules/left-pad/package.json",
    );
    console.log(
      "[dwc] node_modules/left-pad/package.json ->",
      new TextDecoder().decode(leftPadPackageJson),
    );

    // 5) Prove the installed package is not just bytes on disk, but actually
    // *runnable*: a script in the project requiring it by bare specifier,
    // resolved through real node_modules/package.json "main" lookup, spawned
    // with cwd: "/project" so resolution starts from the right place.
    await dwc.fs.writeFile(
      "/project/use-left-pad.js",
      [
        "const leftPad = require('left-pad');",
        "console.log('[left-pad] leftPad(\"5\", 3, \"0\") ->', leftPad('5', 3, '0'));",
        "",
      ].join("\n"),
    );
    const useProc = await dwc.process.spawn("/project/use-left-pad.js", {
      cwd: "/project",
    });
    pipeToTerminal(useProc.stdout, terminal);
    pipeToTerminal(useProc.stderr, terminal);
    const useExit = await useProc.exit;
    console.log("[dwc] use-left-pad.js exited with code", useExit);
    terminal.writeln(`[use-left-pad] exit=${useExit}`);

    // 6) `npm run <script>` through the real CLI too, not just require().
    const pkg = JSON.parse(new TextDecoder().decode(packageJson));
    pkg.scripts = { greet: "node use-left-pad.js" };
    await dwc.fs.writeFile(
      "/project/package.json",
      JSON.stringify(pkg, null, 2),
    );

    const runProc = await dwc.process.spawn("/bin/npm.js", {
      argv: ["run", "greet"],
      cwd: "/project",
    });
    pipeToTerminal(runProc.stdout, terminal);
    pipeToTerminal(runProc.stderr, terminal);
    const runExit = await runProc.exit;
    console.log("[dwc] npm run greet exited with code", runExit);
    terminal.writeln(`[npm run greet] exit=${runExit}`);

    // 7) Dev-server preview (Phases 1-3): a real guest http.createServer(),
    // rendered live in the host page's <iframe id="preview">. Phase 3's
    // Service Worker relay is the still-unconfirmed part (see PROGRESS.md) -
    // this is the real end-to-end exercise for it, not just an ad-hoc test
    // script.
    const PREVIEW_PORT = 4321;
    await dwc.fs.writeFile(
      "/preview-server.js",
      [
        "const http = require('http');",
        "const server = http.createServer((req, res) => {",
        "  res.writeHead(200, { 'Content-Type': 'text/html' });",
        "  res.end(",
        "    '<!doctype html><html><body>' +",
        "    '<h1>Hello from the guest http server</h1>' +",
        "    '<p>path: ' + req.url + '</p>' +",
        "    '</body></html>',",
        "  );",
        "});",
        `server.listen(${PREVIEW_PORT}, () => console.log('[preview-server] listening on ${PREVIEW_PORT}'));`,
        "",
      ].join("\n"),
    );
    const previewServerProc = await dwc.process.spawn("/preview-server.js");
    pipeToTerminal(previewServerProc.stderr, terminal);
    await waitForMarker(previewServerProc.stdout, terminal, "listening on");

    try {
      await dwc.preview.enable({ swUrl: "/dwc-preview-sw.js" });
      console.log("[dwc] preview service worker enabled");
      terminal.writeln("[preview] service worker enabled");

      const previewFrame = document.getElementById("preview") as HTMLIFrameElement | null;
      if (previewFrame) {
        previewFrame.src = dwc.preview.url(PREVIEW_PORT, "/hello");
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
