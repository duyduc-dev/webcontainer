import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm dev --port 5184 --strictPort",
    url: "http://localhost:5184/",
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://localhost:5184/",
  },
});
