import { DuckWebContainer } from "@dwc/core";
import { attachTerminal } from "./terminal";
import { runVerification } from "./verify";

const output = document.getElementById("output")!;

function attachVerificationPanel(dwc: DuckWebContainer) {
  const button = document.getElementById("run-verification") as HTMLButtonElement;
  const verifyOutput = document.getElementById("verify-output")!;

  button.addEventListener("click", async () => {
    button.disabled = true;
    verifyOutput.textContent = "running...";
    try {
      const results = await runVerification(dwc);
      verifyOutput.textContent = results
        .map((r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n      ${r.detail}`)
        .join("\n\n");
    } catch (error) {
      verifyOutput.textContent = `verification crashed: ${String(error)}`;
    } finally {
      button.disabled = false;
    }
  });
}

const main = async () => {
  try {
    const dwc = DuckWebContainer.initialize();
    console.log("DuckWebContainer instantiated", dwc);
    output.textContent = "DuckWebContainer instantiated successfully.";

    await dwc.fs.mkdir("/project", { recursive: true });
    await dwc.fs.writeFile("/project/hello.txt", "hello world");
    const content = await dwc.fs.readFile("/project/hello.txt", "utf8");
    const list = await dwc.fs.readdir("/project");
    output.textContent = `read back: ${content}, dir: ${list.join(",")}`;

    await dwc.shell.exec("mkdir -p /project");
    await dwc.shell.exec("cd /project");
    const pwd = await dwc.shell.exec("pwd");
    console.log(pwd.stdout); // "/project"

    // Root-absolute asset paths ("/style.css", "/app.js") exercise the
    // Service Worker's per-client port tracking: the iframe navigates to a
    // prefixed URL, but the browser resolves these against the document
    // itself, so they arrive with no prefix at all.
    await dwc.fs.writeFile(
      "/project/server.js",
      String.raw`const http = require("http");
const server = http.createServer((req, res) => {
  if (req.url === "/style.css") {
    res.writeHead(200, { "Content-Type": "text/css" });
    res.end("body { background: #1e293b; color: #e2e8f0; font-family: sans-serif; }\n");
    return;
  }
  if (req.url === "/app.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end("document.getElementById('msg').textContent = 'root-absolute assets loaded!';\n");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(
    "<!doctype html>\n" +
    "<html>\n" +
    "  <head><link rel='stylesheet' href='/style.css'></head>\n" +
    "  <body>\n" +
    "    <p id='msg'>waiting for /app.js...</p>\n" +
    "    <script src='/app.js'></script>\n" +
    "  </body>\n" +
    "</html>\n"
  );
});
server.listen(3000, () => console.log("listening on 3000"));
`,
    );

    // spawn (not exec) since a listening server never exits on its own.
    const listening = new Promise<number>((resolve) => {
      const unsubscribe = dwc.on("listen", (event) => {
        unsubscribe();
        resolve((event as { port: number }).port);
      });
    });
    const server = await dwc.shell.spawn("node /project/server.js");
    server.onData((stream, chunk) => console.log(`[server:${stream}]`, chunk));

    const port = await listening;
    const preview = await dwc.preview.fetch(port, "/");
    output.textContent += `\npreview [${preview.status}]: ${preview.body}`;

    await dwc.preview.enable({ swUrl: "/dwc-preview-sw.js" });
    const previewFrame = document.getElementById("preview") as HTMLIFrameElement;
    previewFrame.src = dwc.preview.url(port);

    attachTerminal(dwc, document.getElementById("terminal")!);
    attachVerificationPanel(dwc);
  } catch (error) {
    console.error("Failed to instantiate DuckWebContainer", error);
    output.textContent = `Failed to instantiate DuckWebContainer: ${String(error)}`;
  }
};

main();
