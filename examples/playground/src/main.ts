import { DuckWebContainer } from "@dwc/core";
import { attachTerminal } from "./terminal";

const output = document.getElementById("output")!;

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

    await dwc.fs.writeFile(
      "/project/server.js",
      String.raw`const http = require("http");
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello from inside the container!\n");
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

    attachTerminal(dwc, document.getElementById("terminal")!);
  } catch (error) {
    console.error("Failed to instantiate DuckWebContainer", error);
    output.textContent = `Failed to instantiate DuckWebContainer: ${String(error)}`;
  }
};

main();
