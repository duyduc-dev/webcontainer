import { bootWC } from "duckwc";

const dwc = bootWC();
// Keep the live sandbox available to host-side editor integrations (and the
// playground's own regression tests) after booting it.
Object.assign(window, { dwc });
const terminal = document.getElementById("terminal");
const MAX_TERMINAL_CHARS = 40_000;

function terminalValue(value: unknown): string {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function log(...values: unknown[]): void {
  console.log(...values);
  terminal?.append(`${values.map(terminalValue).join(" ")}\n`);
  if (terminal && terminal.textContent && terminal.textContent.length > MAX_TERMINAL_CHARS) {
    terminal.textContent = terminal.textContent.slice(-MAX_TERMINAL_CHARS);
  }
  terminal?.scrollTo({ top: terminal.scrollHeight });
}

function logError(...values: unknown[]): void {
  console.error(...values);
  terminal?.append(`${values.map(terminalValue).join(" ")}\n`);
  if (terminal && terminal.textContent && terminal.textContent.length > MAX_TERMINAL_CHARS) {
    terminal.textContent = terminal.textContent.slice(-MAX_TERMINAL_CHARS);
  }
  terminal?.scrollTo({ top: terminal.scrollHeight });
}

function pipeToConsole(stream: ReadableStream<Uint8Array>, label: string): void {
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  void (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        const trailing = decoder.decode();
        if (trailing) log(`[${label}]`, trailing);
        return;
      }
      log(`[${label}]`, decoder.decode(value, { stream: true }));
    }
  })();
}

function pipeToConsoleUntil(stream: ReadableStream<Uint8Array>, label: string, marker: string): Promise<void> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  return new Promise<void>((resolve, reject) => {
    let found = false;
    let trailingText = "";

    const logAndCheck = (text: string): void => {
      if (!text) return;

      log(`[${label}]`, text);
      if (found) return;

      const combined = trailingText + text;
      if (combined.includes(marker)) {
        found = true;
        resolve();
        return;
      }

      const trailingLength = Math.max(marker.length - 1, 0);
      trailingText = trailingLength === 0 ? "" : combined.slice(-trailingLength);
    };

    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            logAndCheck(decoder.decode());
            if (!found) {
              reject(new Error(`[${label}] exited before printing ${JSON.stringify(marker)}`));
            }
            return;
          }

          logAndCheck(decoder.decode(value, { stream: true }));
        }
      } catch (error) {
        if (found) {
          logError(`[${label}] output stream failed after startup:`, error);
        } else {
          reject(error);
        }
      } finally {
        reader.releaseLock();
      }
    })();
  });
}

function waitForListen(dwc: ReturnType<typeof bootWC>, port: number, timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error(`timed out waiting for a guest server on port ${port}`));
    }, timeoutMs);
    const unsubscribe = dwc.addEventListener("listen", (event: { port?: unknown }) => {
      if (event.port !== port) return;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
}

const PROJECT_DIR = "/my-ng-app";
const DEV_PORT = 4200;

const main = async () => {
  const npm = await dwc.npm.install("10.9.2");
  log("npm loaded result:", npm.version, npm.fileCount);

  // `npm create @angular@latest` resolves to the `@angular/create` package -
  // the same npm-create convention `npm create vite@latest` uses. --defaults
  // skips every interactive prompt (routing, SSR, styling, etc.) instead of
  // hanging waiting for stdin the browser sandbox never provides.
  log("[ng new] scaffolding a real Angular app...");
  const create = await dwc.shell.spawn(
    "npm create @angular@latest my-ng-app -- --skip-install --skip-git --defaults",
  );
  pipeToConsole(create.stdout, "ng new");
  pipeToConsole(create.stderr, "ng new");
  const createExit = await create.exit;
  log(`[ng new] exit=${createExit}`);
  if (createExit !== 0) return;

  // @angular/build (the engine behind `ng serve`) depends directly on the
  // native `esbuild` binary and pins an exact Rolldown release for its own
  // Vite-based dev server - both need the same overrides the Vite playground
  // applies: swap native esbuild for the WASM build, and move Rolldown past
  // the sandboxed tokio-runtime panic (rolldown#8747), fixed upstream in
  // v1.2.1 but pinned by @angular/build at the pre-fix v1.2.0.
  const packageJsonPath = `${PROJECT_DIR}/package.json`;
  const scaffoldedPkg = JSON.parse(new TextDecoder().decode(await dwc.fs.readFile(packageJsonPath))) as {
    devDependencies?: Record<string, string>;
    overrides?: Record<string, string>;
  };
  scaffoldedPkg.overrides = {
    ...scaffoldedPkg.overrides,
    esbuild: "npm:esbuild-wasm@^0.25.0",
    rollup: "npm:@rollup/wasm-node@^4.43.0",
    rolldown: "^1.2.1",
  };
  await dwc.fs.writeFile(packageJsonPath, JSON.stringify(scaffoldedPkg, null, 2));
  log("[angular] pinned esbuild-wasm / @rollup/wasm-node / Rolldown>=1.2.1 overrides for the browser sandbox");

  log("[install] Resolving and downloading dependencies...");
  const install = await dwc.shell.spawn("npm install --force --loglevel=info --foreground-scripts", {
    cwd: PROJECT_DIR,
  });
  pipeToConsole(install.stdout, "install");
  pipeToConsole(install.stderr, "install");
  const installExit = await install.exit;
  log(`[npm install] exit=${installExit}`);
  if (installExit !== 0) return;

  // Subscribe before starting the shell command: the dev server can reach
  // listen() before its first stdout chunk is observed.
  const devListening = waitForListen(dwc, DEV_PORT);
  const dev = await dwc.shell.spawn(`npm start -- --port ${DEV_PORT}`, { cwd: PROJECT_DIR });
  const devReady = pipeToConsoleUntil(dev.stdout, "dev", "Local:");
  pipeToConsole(dev.stderr, "dev");
  // A dev server never exits on its own - dev.exit intentionally isn't
  // awaited here. dev.kill() is available to stop it later.

  try {
    await Promise.all([devReady, devListening]);
  } catch (error) {
    dev.kill();
    const exitCode = await dev.exit;
    logError("ng serve exited before it was preview-ready:", exitCode, error);
    return;
  }

  await dwc.preview.enable({ swUrl: "/dwc-preview-sw.js", id: "angular-playground" });
  const url = dwc.preview.url(DEV_PORT, "/");
  const preview = document.getElementById("preview") as HTMLIFrameElement | null;
  if (!preview) {
    logError("[preview] no #preview iframe found");
    return;
  }

  preview.src = url;
  log("[preview] iframe.src ->", preview.src);
};

void main().catch((error) => logError("[angular-playground] startup failed:", error));
