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
      const text = decoder.decode(value, { stream: true });
      terminal.write(text);
      // Also mirrored to console.log - xterm renders to canvas, not plain
      // DOM text, so this is what a headless/automated check actually reads.
      console.log("[out]", text);
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
      const text = decoder.decode(value, { stream: true });
      terminal.write(text);
      console.log("[out]", text);
      if (!seen && text.includes(marker)) {
        seen = true;
        resolveFound();
      }
    }
  })();

  return found;
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
    const { version: vendoredVersion, fileCount } = await loadVendoredNpm(dwc);
    console.log("[dwc] loaded vendored npm", vendoredVersion, `(${fileCount} files)`);
    terminal.writeln(`[vendor] loaded real npm ${vendoredVersion} (${fileCount} files)`);

    // 2) Real `npm create vite@latest` - scaffolds a real project by
    // fetching+running create-vite through npm's own exec machinery (sh -c
    // dispatch + PATH resolution + stdio:inherit, all added this session -
    // see PROGRESS.md). Auto-answers whatever confirmation prompt npm's own
    // exec flow shows, same as every other npm-create test in this project.
    const createProc = await dwc.process.spawn("/bin/npm.js", {
      argv: ["create", "vite@latest", "my-app", "--", "--template", "vanilla"],
      cwd: "/",
    });
    pipeToTerminal(createProc.stdout, terminal);
    pipeToTerminal(createProc.stderr, terminal);
    setTimeout(() => {
      const writer = createProc.stdin.getWriter();
      writer.write(new TextEncoder().encode("y\n"));
      writer.releaseLock();
    }, 3000);
    const createExit = await createProc.exit;
    console.log("[dwc] npm create vite exited with code", createExit);
    terminal.writeln(`\r\n[npm create vite] exit=${createExit}`);
    if (createExit !== 0) return;

    // 2.5) Pin the scaffolded project to Vite 7 instead of latest (Vite 8
    // defaults to rolldown, which hits a confirmed upstream bug - a Rust
    // static left torn down after the first native call panics on a later
    // one - that crashes the dev server on essentially any real request;
    // see PROGRESS.md item 9, and item 10 for this workaround's own
    // history). Vite 7 uses esbuild instead, but plain esbuild/rollup each
    // ship a native binary this environment can't run - `overrides`
    // aliases both to their real WASM builds (the same technique
    // StackBlitz-style demos use for this), verified live end-to-end:
    // a real, interactive Vite dev server preview, no crash, dozens of
    // repeated requests all serving correctly.
    const packageJsonPath = "/my-app/package.json";
    const scaffoldedPkg = JSON.parse(new TextDecoder().decode(await dwc.fs.readFile(packageJsonPath))) as {
      devDependencies?: Record<string, string>;
      overrides?: Record<string, string>;
    };
    scaffoldedPkg.devDependencies = { ...scaffoldedPkg.devDependencies, vite: "^7.0.0" };
    scaffoldedPkg.overrides = {
      ...scaffoldedPkg.overrides,
      esbuild: "npm:esbuild-wasm@^0.25.0",
      rollup: "npm:@rollup/wasm-node@^4.43.0",
    };
    await dwc.fs.writeFile(packageJsonPath, JSON.stringify(scaffoldedPkg, null, 2));
    terminal.writeln("[dwc] pinned vite to ^7.0.0 (esbuild-wasm/@rollup/wasm-node overrides) to avoid item 9's rolldown crash");

    // 3) Real `npm install` inside the scaffolded project - installs vite
    // itself plus every real dependency the vanilla template's own
    // package.json lists.
    const installProc = await dwc.process.spawn("/bin/npm.js", {
      argv: ["install", "--no-audit", "--no-fund", "--loglevel=warn"],
      cwd: "/my-app",
    });
    pipeToTerminal(installProc.stdout, terminal);
    pipeToTerminal(installProc.stderr, terminal);
    const installExit = await installProc.exit;
    console.log("[dwc] npm install (in /my-app) exited with code", installExit);
    terminal.writeln(`\r\n[npm install] exit=${installExit}`);
    if (installExit !== 0) return;

    // 4) Real `npm run dev` - runs the scaffolded package.json's own "dev"
    // script (`vite`) through the SAME sh -c dispatch npm's own
    // @npmcli/run-script always uses for package.json scripts, not just
    // npm exec/npx. This is the actual end-to-end test: does the real vite
    // dev server (via real rolldown/WASM under the hood) come up at all.
    const devProc = await dwc.process.spawn("/bin/npm.js", {
      argv: ["run", "dev"],
      cwd: "/my-app",
    });
    pipeToTerminal(devProc.stderr, terminal);
    await waitForMarker(devProc.stdout, terminal, "Local:");

    // 5) Preview it live: Service Worker relay + <iframe id="preview">.
    // Vite's own default dev-server port.
    try {
      await dwc.preview.enable({ swUrl: "/dwc-preview-sw.js" });
      terminal.writeln("[preview] service worker enabled");

      const previewFrame = document.getElementById("preview") as HTMLIFrameElement | null;
      if (previewFrame) {
        previewFrame.src = dwc.preview.url(5173, "/");
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
