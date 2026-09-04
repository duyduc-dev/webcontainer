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
      "workers/kernel/worker": "src/workers/kernel/worker.ts",
    },
    format: ["esm"],
    sourcemap: true,
    clean: false,
  },
]);
