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

  // const createProc = await dwc.process.spawn("/bin/npm.js", {
  //   argv: ["create", "vite@latest", "my-app", "--", "--template", "vanilla"],
  //   cwd: "/",
  // });

  // pipeToTerminal(createProc.stdout);

  // await createProc.exit;

  const shell3 = await dwc.shell.exec("cat /my-vite-app/src/main.js");
  console.log("shell exec result 3:", shell3.output.split("\n"));

  const install = await dwc.shell.spawn("npm install", { cwd: "/my-vite-app" });
  pipeToConsole(install.stdout, "install");
  pipeToConsole(install.stderr, "install");
  const installExit = await install.exit;
  console.log("npm install exit code:", installExit);
  if (installExit !== 0) return;

  const shell4 = await dwc.shell.exec("cd my-vite-app && ls -la");
  console.log("shell exec result 4:", shell4.output.split("\n"));

  const dev = await dwc.shell.spawn("npm run dev", { cwd: "/my-vite-app" });
  pipeToConsole(dev.stdout, "dev");
  pipeToConsole(dev.stderr, "dev");
  // A dev server never exits on its own - dev.exit intentionally isn't
  // awaited here. dev.kill() is available to stop it later.

  // Wait for the guest server to actually bind the port before touching
  // preview - dev.spawn() resolving only means the process STARTED, not
  // that Vite has finished booting (can take 15-20+s for a real cold
  // start). Without this, preview.enable()/the iframe navigation races
  // ahead and hits "nothing is listening on port 5173".
  await new Promise<void>((resolve) => {
    const off = dwc.addEventListener("listen", (payload: { port: number }) => {
      if (payload.port !== 5173) return;
      off();
      resolve();
    });
  });

  await dwc.preview.enable({ swUrl: "/dwc-preview-sw.js" });
  const url = dwc.preview.url(5173, "/");
  console.log("url >> ", url);
  const preview = document.getElementById("preview");
  preview?.setAttribute("src", url);
};

main();
