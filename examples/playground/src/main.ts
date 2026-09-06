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
      [
        "console.log('hello from the process worker');",
        "console.log('argv:', process.argv.join(' '));",
        "const fs = require('fs');",
        "console.log('readFileSync /hello.txt ->', new TextDecoder().decode(fs.readFileSync('/hello.txt')));",
        "",
      ].join("\n"),
    );

    const proc = await dwc.process.spawn("/run.js", { argv: ["--flag"] });
    pipeToTerminal(proc.stdout, terminal);
    pipeToTerminal(proc.stderr, terminal);

    const exitCode = await proc.exit;
    console.log("[dwc] process exited with code", exitCode);
    terminal.writeln(`\r\n[process exited with code ${exitCode}]`);

    const shellResult = await dwc.shell.exec("mkdir -p /x && echo hi > /x/f && cat /x/f");
    console.log("[dwc] shell.exec result ->", JSON.stringify(shellResult.output));
    terminal.writeln(`[shell] mkdir -p /x && echo hi > /x/f && cat /x/f -> ${JSON.stringify(shellResult.output)}`);

    // Phase 6/7 demo: real vendored Node events/stream/crypto, and a real
    // network request through the Fetcher Worker via require('https').
    await dwc.fs.writeFile(
      "/net-test.js",
      [
        "const EventEmitter = require('events');",
        "const { Readable, Writable } = require('stream');",
        "const crypto = require('crypto');",
        "const https = require('https');",
        "",
        "const emitter = new EventEmitter();",
        "emitter.on('greet', (name) => console.log('[events] hello,', name));",
        "emitter.emit('greet', 'world');",
        "",
        "const chunks = [];",
        "const writable = new Writable({",
        "  write(chunk, enc, cb) { chunks.push(chunk.toString()); cb(); },",
        "});",
        "writable.on('finish', () => console.log('[stream] piped:', chunks.join('')));",
        "Readable.from(['a', 'b', 'c']).pipe(writable);",
        "",
        "console.log('[crypto] sha256(\"hello\") =', crypto.createHash('sha256').update('hello').digest('hex'));",
        "console.log('[crypto] randomUUID() =', crypto.randomUUID());",
        "",
        "https.get('https://registry.npmjs.org/left-pad', (res) => {",
        "  let data = '';",
        "  res.on('data', (chunk) => { data += chunk; });",
        "  res.on('end', () => {",
        "    const pkg = JSON.parse(data);",
        "    console.log('[https] fetched from registry.npmjs.org: name=', pkg.name, 'latest=', pkg['dist-tags'].latest);",
        "  });",
        "}).on('error', (err) => console.error('[https] error:', err.message));",
        "",
      ].join("\n"),
    );

    const netProc = await dwc.process.spawn("/net-test.js");
    pipeToTerminal(netProc.stdout, terminal);
    pipeToTerminal(netProc.stderr, terminal);
    const netExitCode = await netProc.exit;
    console.log("[dwc] net-test process exited with code", netExitCode);

    // `node <script>` reachable from the shell (dwc.shell.exec), not just
    // dwc.process.spawn() directly.
    await dwc.fs.writeFile("/shell-node.js", "console.log('[shell-node] ran via dwc.shell.exec');\n");
    const nodeShellResult = await dwc.shell.exec("node /shell-node.js");
    console.log("[dwc] shell.exec('node /shell-node.js') result ->", JSON.stringify(nodeShellResult.output));
    terminal.writeln(`[shell] node /shell-node.js -> ${JSON.stringify(nodeShellResult.output)}`);

    // Phase 8 demo: real vendored `net` — a script that both listens and
    // connects to its own server over the in-process loopback binding.
    await dwc.fs.writeFile(
      "/net-demo.js",
      [
        "const net = require('net');",
        "const server = net.createServer((socket) => {",
        "  socket.on('data', (chunk) => console.log('[net] server got:', chunk.toString()));",
        "  socket.write('hello from server');",
        "});",
        "server.listen(0, () => {",
        "  const port = server.address().port;",
        "  const client = net.connect(port, 'localhost', () => client.write('hello from client'));",
        "  client.on('data', (chunk) => {",
        "    console.log('[net] client got:', chunk.toString());",
        "    client.end();",
        "  });",
        "  client.on('close', () => server.close());",
        "});",
        "",
      ].join("\n"),
    );
    const netDemoProc = await dwc.process.spawn("/net-demo.js");
    pipeToTerminal(netDemoProc.stdout, terminal);
    pipeToTerminal(netDemoProc.stderr, terminal);
    const netDemoExitCode = await netDemoProc.exit;
    console.log("[dwc] net-demo process exited with code", netDemoExitCode);
  } catch (error) {
    if (error instanceof DWCError) {
      console.error(`[dwc] boot failed: ${error.code} - ${error.message}`);
      return;
    }
    throw error;
  }
}

main();
