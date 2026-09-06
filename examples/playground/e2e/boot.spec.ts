import { expect, test } from "@playwright/test";

test("bootDWC() completes a real PING/PONG handshake against the kernel worker", async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect
    .poll(() => consoleMessages.some((text) => text.includes("[dwc]") && text.includes("reply")))
    .toBe(true);

  expect(pageErrors).toEqual([]);
});

test("dwc.process.spawn runs a script through the process worker and streams its output", async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect.poll(() => consoleMessages.some((text) => text.includes("process exited with code 0"))).toBe(true);

  const terminalText = await page.locator("#terminal").innerText();
  expect(terminalText).toContain("hello from the process worker");
  expect(terminalText).toContain("argv: node /run.js --flag");
  expect(terminalText).toContain("readFileSync /hello.txt -> Hello, duck-webcontainer!");

  expect(pageErrors).toEqual([]);
});

test("dwc.shell.exec runs a chained shell line through /bin coreutils resolved on PATH", async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect
    .poll(() => consoleMessages.some((text) => text.includes("shell.exec short-circuit result")))
    .toBe(true);

  const terminalText = await page.locator("#terminal").innerText();
  // mkdir/echo/cat all resolve to real /bin/<name>.js programs run as spawned
  // processes (kernel/fs/coreutils.ts), not the old hardcoded builtin table.
  expect(terminalText).toContain('mkdir -p /x && echo hi > /x/f && cat /x/f -> "hi\\n"');
  // `node` is no longer restricted to being the line's sole command — it can
  // chain with && into a PATH-resolved coreutil like any other command.
  expect(terminalText).toContain('node /shell-chain.js && echo done -> "from node\\ndone\\n"');
  // && short-circuits on a non-zero exit: "nope" must never run.
  expect(terminalText).toContain('false && echo nope -> ""');

  expect(pageErrors).toEqual([]);
});

test("real vendored events/stream/crypto run, and https reaches the real npm registry", async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect
    .poll(() => consoleMessages.some((text) => text.includes("shell.exec('node /shell-node.js')")), { timeout: 15000 })
    .toBe(true);

  // xterm.js visually wraps long lines at the terminal's column width, so
  // innerText() can insert a newline mid-string (e.g. inside the sha256 hex
  // digest) - strip newlines before substring checks rather than assert on
  // the raw wrapped text.
  const terminalText = (await page.locator("#terminal").innerText()).replace(/\n/g, "");
  expect(terminalText).toContain("[events] hello, world");
  expect(terminalText).toContain('[crypto] sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  expect(terminalText).toMatch(/\[crypto] randomUUID\(\) = [0-9a-f-]{36}/);
  expect(terminalText).toContain("[stream] piped: abc");
  // node <script> reachable from dwc.shell.exec(), not just dwc.process.spawn().
  expect(terminalText).toContain('[shell] node /shell-node.js -> "[shell-node] ran via dwc.shell.exec\\n"');
  expect(terminalText).toContain("[https] fetched from registry.npmjs.org: name= left-pad latest=");

  expect(pageErrors).toEqual([]);
});

test("real vendored net: a script talks to its own server over the loopback binding", async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect
    .poll(() => consoleMessages.some((text) => text.includes("net-demo process exited with code 0")), { timeout: 15000 })
    .toBe(true);

  const terminalText = await page.locator("#terminal").innerText();
  expect(terminalText).toContain("[net] server got: hello from client");
  expect(terminalText).toContain("[net] client got: hello from server");

  expect(pageErrors).toEqual([]);
});

test("real vendored net: two separate process workers talk over the kernel's cross-process relay", async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect
    .poll(() => consoleMessages.some((text) => text.includes("net-xproc-server exited with code 0")), { timeout: 15000 })
    .toBe(true);

  const terminalText = await page.locator("#terminal").innerText();
  expect(terminalText).toContain("[net-xproc] server got: hello from cross-process client");
  expect(terminalText).toContain("[net-xproc] client got: hello from cross-process server");

  expect(pageErrors).toEqual([]);
});

test("real vendored child_process: spawn() streams a PATH-resolved coreutil, exec() delegates to the shell, and an unresolvable command reports a clean error", async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect
    .poll(() => consoleMessages.some((text) => text.includes("child-process-demo exited with code 0")), { timeout: 15000 })
    .toBe(true);

  const terminalText = await page.locator("#terminal").innerText();
  expect(terminalText).toContain("[child_process] spawn stdout: hi-from-spawn");
  expect(terminalText).toContain("[child_process] spawn exited with code 0");
  expect(terminalText).toContain("[child_process] spawn error: nope-cmd: command not found");
  expect(terminalText).toContain('[child_process] exec output: "z\\n"');

  expect(pageErrors).toEqual([]);
});

test("node_modules require() resolution: a bare specifier resolves through package.json's \"main\" field", async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect
    .poll(() => consoleMessages.some((text) => text.includes("require-node-modules-demo exited with code 0")), { timeout: 15000 })
    .toBe(true);

  const terminalText = await page.locator("#terminal").innerText();
  // Proves both the "main" field lookup AND that the package's own relative
  // require('./pad-char') resolved against itself, not the requiring script.
  expect(terminalText).toContain('[require] left-pad("5", 3, "0") -> 005');

  expect(pageErrors).toEqual([]);
});

test("dwc.fs mounts a declarative tree and reads it back through the FS worker", async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect
    .poll(() => consoleMessages.some((text) => text.includes("readFile /hello.txt") && text.includes("Hello, duck-webcontainer!")))
    .toBe(true);

  await expect
    .poll(() => consoleMessages.some((text) => text.includes("readdir /src") && text.includes("index.js")))
    .toBe(true);

  expect(pageErrors).toEqual([]);
});
