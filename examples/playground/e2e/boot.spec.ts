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

test("dwc.shell.exec runs a chained shell line through the sync fs bridge", async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect
    .poll(() => consoleMessages.some((text) => text.includes("shell.exec result") && text.includes("hi")))
    .toBe(true);

  const terminalText = await page.locator("#terminal").innerText();
  expect(terminalText).toContain('mkdir -p /x && echo hi > /x/f && cat /x/f -> "hi\\n"');

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
