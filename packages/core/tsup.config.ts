import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: {
      "workers/kernel/KernelWorker": "src/workers/kernel/KernelWorker.ts",
      "workers/guest/GuestWorker": "src/workers/guest/GuestWorker.ts",
      "workers/preview/PreviewServiceWorker": "src/workers/preview/PreviewServiceWorker.ts",
    },
    format: ["esm"],
    sourcemap: true,
    clean: false,
  },
]);
