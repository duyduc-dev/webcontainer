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

    // Phase 8c demo: coreutils/PATH layer — `node` chained with && alongside
    // a PATH-resolved (/bin/echo.js) command, no longer sole-command-only.
    await dwc.fs.writeFile("/shell-chain.js", "console.log('from node');\n");
    const chainResult = await dwc.shell.exec("node /shell-chain.js && echo done");
    console.log("[dwc] shell.exec chain result ->", JSON.stringify(chainResult.output));
    terminal.writeln(`[shell] node /shell-chain.js && echo done -> ${JSON.stringify(chainResult.output)}`);

    // && short-circuits on a non-zero exit — "nope" must never run.
    const shortCircuitResult = await dwc.shell.exec("false && echo nope");
    console.log("[dwc] shell.exec short-circuit result ->", JSON.stringify(shortCircuitResult.output));
    terminal.writeln(`[shell] false && echo nope -> ${JSON.stringify(shortCircuitResult.output)}`);

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

    // Phase 8 demo: cross-process net — a server in ONE process worker, a
    // client in a SEPARATE one, reaching it through the kernel's relay
    // (workers/kernel/netRelay.ts) rather than the same-process loopback.
    await dwc.fs.writeFile(
      "/net-xproc-server.js",
      [
        "const net = require('net');",
        "const server = net.createServer((socket) => {",
        "  socket.on('data', (chunk) => console.log('[net-xproc] server got:', chunk.toString()));",
        "  socket.write('hello from cross-process server');",
        "  socket.on('close', () => server.close());",
        "});",
        "server.listen(4000, () => console.log('[net-xproc] server listening on 4000'));",
        "setTimeout(() => server.close(), 5000);", // safety fallback if the client never connects
        "",
      ].join("\n"),
    );
    await dwc.fs.writeFile(
      "/net-xproc-client.js",
      [
        "const net = require('net');",
        "const client = net.connect(4000, 'localhost', () => client.write('hello from cross-process client'));",
        "client.on('data', (chunk) => {",
        "  console.log('[net-xproc] client got:', chunk.toString());",
        "  client.end();",
        "});",
        "client.on('error', (err) => console.error('[net-xproc] client error:', err.message));",
        "",
      ].join("\n"),
    );

    const xprocServer = await dwc.process.spawn("/net-xproc-server.js");
    pipeToTerminal(xprocServer.stdout, terminal);
    pipeToTerminal(xprocServer.stderr, terminal);
    // Give the server's fire-and-forget kernel registration (see
    // netRelay.ts's file header) a moment to land before the client dials it.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const xprocClient = await dwc.process.spawn("/net-xproc-client.js");
    pipeToTerminal(xprocClient.stdout, terminal);
    pipeToTerminal(xprocClient.stderr, terminal);
    const xprocClientExit = await xprocClient.exit;
    console.log("[dwc] net-xproc-client exited with code", xprocClientExit);
    const xprocServerExit = await xprocServer.exit;
    console.log("[dwc] net-xproc-server exited with code", xprocServerExit);

    // Phase 8d demo: real vendored `child_process` — spawn() streaming a
    // PATH-resolved coreutil, exec() delegating to the kernel's own shell
    // (real &&/>/PATH support for free), and spawn() reporting a clean
    // 'error' for an unresolvable command rather than hanging.
    await dwc.fs.writeFile(
      "/child-process-demo.js",
      [
        "const { spawn, exec } = require('child_process');",
        "",
        "const child = spawn('echo', ['hi-from-spawn']);",
        "child.stdout.on('data', (chunk) => console.log('[child_process] spawn stdout:', chunk.toString().trim()));",
        "child.on('exit', (code) => console.log('[child_process] spawn exited with code', code));",
        "",
        "exec('mkdir -p /y && echo z > /y/f && cat /y/f', (err, stdout) => {",
        "  console.log('[child_process] exec output:', JSON.stringify(stdout));",
        "});",
        "",
        "const bad = spawn('nope-cmd', []);",
        "bad.on('error', (err) => console.log('[child_process] spawn error:', err.message));",
        "",
      ].join("\n"),
    );
    const childProcessDemo = await dwc.process.spawn("/child-process-demo.js");
    pipeToTerminal(childProcessDemo.stdout, terminal);
    pipeToTerminal(childProcessDemo.stderr, terminal);
    const childProcessDemoExit = await childProcessDemo.exit;
    console.log("[dwc] child-process-demo exited with code", childProcessDemoExit);

    // node_modules require() resolution demo: a hand-mounted fake package
    // (no real npm install yet — that's a later phase) proving require('left-pad')
    // resolves through package.json's "main" field, and that the package's own
    // relative requires resolve against ITSELF, not the requiring script.
    await dwc.fs.mount({
      node_modules: {
        directory: {
          "left-pad": {
            directory: {
              "package.json": { file: { contents: JSON.stringify({ name: "left-pad", main: "lib/left-pad.js" }) } },
              lib: {
                directory: {
                  "left-pad.js": {
                    file: {
                      contents: [
                        "const { pad } = require('./pad-char');",
                        "module.exports = function leftPad(str, len, ch) {",
                        "  str = String(str);",
                        "  while (str.length < len) str = pad(ch) + str;",
                        "  return str;",
                        "};",
                        "",
                      ].join("\n"),
                    },
                  },
                  "pad-char.js": { file: { contents: "exports.pad = (ch) => (ch === undefined ? ' ' : ch);\n" } },
                },
              },
            },
          },
        },
      },
    });
    await dwc.fs.writeFile(
      "/require-node-modules-demo.js",
      ["const leftPad = require('left-pad');", "console.log('[require] left-pad(\"5\", 3, \"0\") ->', leftPad('5', 3, '0'));", ""].join("\n"),
    );
    const requireDemo = await dwc.process.spawn("/require-node-modules-demo.js");
    pipeToTerminal(requireDemo.stdout, terminal);
    pipeToTerminal(requireDemo.stderr, terminal);
    const requireDemoExit = await requireDemo.exit;
    console.log("[dwc] require-node-modules-demo exited with code", requireDemoExit);
  } catch (error) {
    if (error instanceof DWCError) {
      console.error(`[dwc] boot failed: ${error.code} - ${error.message}`);
      return;
    }
    throw error;
  }
}

main();
