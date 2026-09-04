import { bootDWC, DWCError } from "@dwc/core";
import { Terminal } from "@xterm/xterm";

function pipeToTerminal(stream: ReadableStream<Uint8Array>, terminal: Terminal): void {
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

async function main() {
  const terminal = new Terminal({ convertEol: true });
  terminal.open(document.getElementById("terminal")!);

  try {
    const dwc = await bootDWC();

    dwc.diagnostics.onEvent((event) => {
      console.log("[dwc]", event.type, event.payload);
    });

    dwc.addEventListener("ready", (e) => {
      console.log("ready", e);
    });

    await dwc.fs.mount({
      "hello.txt": { file: { contents: "Hello, duck-webcontainer!" } },
      src: {
        directory: {
          "index.js": { file: { contents: "console.log('hi');\n" } },
        },
      },
    });

    const contents = await dwc.fs.readFile("/hello.txt");
    console.log("[dwc] readFile /hello.txt ->", new TextDecoder().decode(contents));

    const entries = await dwc.fs.readdir("/src");
    console.log("[dwc] readdir /src ->", entries);

    await dwc.fs.writeFile(
      "/run.js",
      "console.log('hello from the process worker');\nconsole.log('argv:', process.argv.join(' '));\n",
    );

    const proc = await dwc.process.spawn("/run.js", { argv: ["--flag"] });
    pipeToTerminal(proc.stdout, terminal);
    pipeToTerminal(proc.stderr, terminal);

    const exitCode = await proc.exit;
    console.log("[dwc] process exited with code", exitCode);
    terminal.writeln(`\r\n[process exited with code ${exitCode}]`);
  } catch (error) {
    if (error instanceof DWCError) {
      console.error(`[dwc] boot failed: ${error.code} - ${error.message}`);
      return;
    }
    throw error;
  }
}

main();
