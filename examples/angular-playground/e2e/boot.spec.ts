import { expect, test } from "@playwright/test";

// Same shape as examples/playground/e2e/boot.spec.ts: a real `npm create
// @angular@latest`, a real `npm install` against the real registry (with the
// esbuild-wasm/@rollup/wasm-node/Rolldown overrides applied), and a real
// `ng serve` whose dev server is previewed through the sandbox's Service
// Worker relay. Several minutes, dominated by the real npm install.
test.setTimeout(10 * 60 * 1000);

test("the angular playground scaffolds a real Angular app, installs it, and shows a real dev-server preview", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect(page.locator("#terminal")).toContainText("[ng new] exit=0", { timeout: 90_000 });
  await expect(page.locator("#terminal")).toContainText("[npm install] exit=0", { timeout: 5 * 60_000 });
  await expect(page.locator("#terminal")).toContainText("[preview] iframe.src ->", { timeout: 3 * 60_000 });

  const terminalText = await page.locator("#terminal").innerText();
  expect(terminalText).not.toContain("RuntimeError");
  expect(terminalText).not.toContain("Cannot find module");

  expect(pageErrors).toEqual([]);
});
