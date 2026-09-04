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
