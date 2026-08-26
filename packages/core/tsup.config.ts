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
    entry: { "workers/kernel/KernelWorker": "src/workers/kernel/KernelWorker.ts" },
    format: ["esm"],
    sourcemap: true,
    clean: false,
  },
]);
