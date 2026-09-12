import { bootDWC } from "@dwc/core";

const dwc = bootDWC();

function pipeToConsole(
  stream: ReadableStream<Uint8Array>,
  label: string,
): void {
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  void (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      console.log(`[${label}]`, decoder.decode(value, { stream: true }));
    }
  })();
}

function pipeToConsoleUntil(
  stream: ReadableStream<Uint8Array>,
  label: string,
  marker: string,
): Promise<void> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  return new Promise<void>((resolve, reject) => {
    let found = false;
    let trailingText = "";

    const logAndCheck = (text: string): void => {
      if (!text) return;

      console.log(`[${label}]`, text);
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
          console.error(`[${label}] output stream failed after startup:`, error);
        } else {
          reject(error);
        }
      } finally {
        reader.releaseLock();
      }
    })();
  });
}

const main = async () => {
  const npm = await dwc.npm.install("10.9.2");
  console.log("npm loaded result:", npm.version, npm.fileCount);

  const shellResult = await dwc.shell.exec("npm -v");
  console.log("shell exec result:", shellResult);

  const shell = await dwc.shell.exec("ls -la /bin");
  console.log("shell exec result 1:", shell.output.split("\n"));

  const shell2 = await dwc.shell.exec(
    "npm create vite@latest my-vite-app -- --template vanilla",
  );
  console.log("shell exec result 2:", shell2.output);

  // Vite 8 uses Rolldown. Declare its WASI binding explicitly: some Rolldown
  // releases do not expose it as an optional dependency for npm to select.
  // Its version must exactly match Vite 8.0.0's Rolldown dependency; mixing
  // Rolldown 1.2's binding with Vite's 1.0.0-rc.9 JavaScript causes a
  // `builtin:vite-wasm-fallback` enum mismatch at server startup.
  const packageJsonPath = "/my-vite-app/package.json";
  const scaffoldedPkg = JSON.parse(new TextDecoder().decode(await dwc.fs.readFile(packageJsonPath))) as {
    devDependencies?: Record<string, string>;
    overrides?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  scaffoldedPkg.devDependencies = {
    ...scaffoldedPkg.devDependencies,
    vite: "8.0.0",
    "@rolldown/binding-wasm32-wasi": "1.0.0-rc.9",
  };
  scaffoldedPkg.overrides = {
    ...scaffoldedPkg.overrides,
    esbuild: "npm:esbuild-wasm@^0.25.0",
    rollup: "npm:@rollup/wasm-node@^4.43.0",
  };
  scaffoldedPkg.scripts = { ...scaffoldedPkg.scripts, dev: "vite --configLoader native" };
  await dwc.fs.writeFile(packageJsonPath, JSON.stringify(scaffoldedPkg, null, 2));
  console.log("[vite] pinned Vite 8.0.0 with its explicit WASI Rolldown binding");

  // The vanilla scaffold has no external app dependencies. Disabling Vite's
  // optional discovery scan avoids the unsupported picomatch path. The native
  // loader avoids the config loader's esbuild service requirement.
  await dwc.fs.writeFile(
    "/my-vite-app/vite.config.mjs",
    `export default {
  optimizeDeps: {
    noDiscovery: true,
  },
};
`,
  );
  console.log("[vite] disabled automatic dependency discovery");

  // const createProc = await dwc.process.spawn("/bin/npm.js", {
  //   argv: ["create", "vite@latest", "my-app", "--", "--template", "vanilla"],
  //   cwd: "/",
  // });

  // pipeToTerminal(createProc.stdout);

  // await createProc.exit;

  const shell3 = await dwc.shell.exec("cat /my-vite-app/src/main.js");
  console.log("shell exec result 3:", shell3.output.split("\n"));

  // The WASI binding declares `cpu: wasm32`, while DWC correctly reports a
  // stable x64 package platform. npm 10's Arborist validates direct package
  // dependencies against process.arch (not npm's --cpu config), so force this
  // one install to retain the explicitly pinned browser-only binding.
  const install = await dwc.shell.spawn("npm install --force", { cwd: "/my-vite-app" });
  pipeToConsole(install.stdout, "install");
  pipeToConsole(install.stderr, "install");
  const installExit = await install.exit;
  console.log("npm install exit code:", installExit);
  if (installExit !== 0) return;

  const shell4 = await dwc.shell.exec("cd my-vite-app && ls -la");
  console.log("shell exec result 4:", shell4.output.split("\n"));

  const dev = await dwc.shell.spawn("npm run dev", { cwd: "/my-vite-app" });
  const devReady = pipeToConsoleUntil(dev.stdout, "dev", "Local:");
  pipeToConsole(dev.stderr, "dev");
  // A dev server never exits on its own - dev.exit intentionally isn't
  // awaited here. dev.kill() is available to stop it later.

  // Vite first probes port 5173 before it starts serving. Waiting for the
  // ready banner avoids previewing that short-lived probe connection.
  try {
    await devReady;
  } catch (error) {
    const exitCode = await dev.exit;
    console.error("npm run dev exited before Vite became ready:", exitCode, error);
    return;
  }

  await dwc.preview.enable({ swUrl: "/dwc-preview-sw.js" });
  const url = dwc.preview.url(5173, "/");
  const preview = document.getElementById("preview") as HTMLIFrameElement | null;
  if (!preview) {
    console.error("[preview] no #preview iframe found");
    return;
  }

  preview.src = url;
  console.log("[preview] iframe.src ->", preview.src);
};

main();
