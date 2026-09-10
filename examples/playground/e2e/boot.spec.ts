import { expect, test } from "@playwright/test";

// The whole flow (a real `npm create vite@latest`, pinning the scaffold to
// Vite 7 + the esbuild-wasm/@rollup/wasm-node overrides, a real `npm
// install` against the real registry, `npm run dev`, then a real request
// the guest server actually serves) is a genuine end-to-end run - several
// minutes, not seconds, dominated by the real npm install. See PROGRESS.md
// items 9/10 for why Vite 7 (not latest/8) is pinned: Vite 8 defaults to
// rolldown, which hits a confirmed upstream bug (a Rust static torn down
// after the first native call panics on a later one) that crashes the dev
// server on almost any real request - not fixable from this project's
// side, so the demo routes around it instead.
test.setTimeout(10 * 60 * 1000);

test("the playground demo scaffolds a real Vite project, installs it, and shows a real, crash-free, interactive dev-server preview (images included)", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  // Scaffolding itself is fast; the real npm install (against the real
  // registry, now also pulling vite@7 + the two WASM-build overrides) is
  // the slow part.
  await expect(page.locator("#terminal")).toContainText("[npm create vite] exit=0", { timeout: 60_000 });
  await expect(page.locator("#terminal")).toContainText("[npm install] exit=0", { timeout: 5 * 60_000 });
  await expect(page.locator("#terminal")).toContainText("[preview] iframe.src ->", { timeout: 3 * 60_000 });

  // Regression guard for item 9's own rolldown crash: if the Vite 7 pin
  // (or either override) ever gets reverted, this is exactly the text
  // that comes back - fail loud and specifically here, not just with a
  // blank iframe further down.
  const terminalText = await page.locator("#terminal").innerText();
  expect(terminalText).not.toContain("RuntimeError");
  expect(terminalText).not.toContain("Cannot find module");

  // The preview iframe is same-origin (both on the Vite dev server's own
  // origin - see previewProtocol.ts), so its document is directly
  // inspectable: real Vite content, not a blank or crashed page.
  await expect
    .poll(async () => page.frame({ url: /__dwc_preview__/ })?.title() ?? null, { timeout: 30_000 })
    .toBe("my-app");

  // At least one real image asset loads correctly - the exact regression
  // this guards against (fs.createReadStream, see PROGRESS.md item 10's
  // own follow-up): before that fix, any image served over HTTP (as
  // opposed to inlined by Vite as a data: URL) 500'd and never rendered.
  await expect
    .poll(
      async () => {
        const frame = page.frame({ url: /__dwc_preview__/ });
        if (!frame) return 0;
        return frame.evaluate(
          () =>
            Array.from(document.querySelectorAll("img")).filter(
              (img) => !img.src.startsWith("data:") && img.complete && img.naturalWidth > 0,
            ).length,
        );
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  expect(pageErrors).toEqual([]);

  // Real WebSocket/HMR transport support: the injected polyfill
  // (workers/preview/wsPolyfill.ts) replaces window.WebSocket inside the
  // preview iframe before Vite's own client script runs (a Service Worker
  // can never intercept a page's own `new WebSocket(...)` call - see that
  // file's doc comment) - confirm it's actually installed, and that a
  // WebSocket dialed through it reaches a real, protocol-correct OPEN
  // state via a genuine RFC 6455 handshake against Vite's own bundled WS
  // server (verified manually end-to-end before adding this assertion).
  //
  // This deliberately does NOT test "edit a file, see a live update" -
  // that additionally requires this runtime's fs.watch (runtime/builtins/
  // fs.ts) to fire real change notifications, which today is a complete
  // no-op stub (accepts a listener, never calls it). Vite's dev server
  // therefore never learns a file changed and never pushes an HMR update
  // over this now-working connection - a separate, currently open gap
  // this test doesn't claim to cover. See PROGRESS.md.
  const frame = page.frame({ url: /__dwc_preview__/ });
  const wsResult = await frame?.evaluate(async () => {
    const anyWindow = window as unknown as { __dwcRealWebSocket?: unknown; WebSocket: new (url: string, protocols?: string | string[]) => WebSocket };
    if (!anyWindow.__dwcRealWebSocket) return { installed: false };

    const ws = new anyWindow.WebSocket("ws://localhost/", "vite-hmr");
    const outcome = await new Promise<string>((resolve) => {
      const timeout = setTimeout(() => resolve(`timeout readyState=${ws.readyState}`), 8000);
      ws.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve(`open protocol=${ws.protocol} readyState=${ws.readyState}`);
      });
      ws.addEventListener("close", (event) => {
        clearTimeout(timeout);
        resolve(`closed code=${event.code}`);
      });
    });
    ws.close();
    return { installed: true, outcome };
  });

  expect(wsResult?.installed).toBe(true);
  expect(wsResult?.outcome).toBe("open protocol=vite-hmr readyState=1");
});
