// Guest-side files written into a scaffolded `--template vue-ts` project so
// it runs inside duckwc.
//
// Vue is an easier fit than React (see reactTsTemplate.ts): it publishes a
// real browser ESM build, so aliasing `vue` at that file gives the dev
// server something it can serve directly and leaves Vite's dependency
// optimizer - the Rolldown WASI path this runtime can't run, PROGRESS.md
// items 9/13 - with nothing to pre-bundle. No UMD globals, no shim modules.
//
// The TypeScript half is the part that needs work. @vitejs/plugin-vue hands
// a `lang="ts"` script block to Vite's own `transformWithEsbuild()` (on
// Vite 8 it would be `transformWithOxc`, which is Rolldown, which traps), so
// unlike the React template this one cannot route TypeScript through Babel:
// the call happens inside the plugin, on source that still needs its type
// annotations intact for compiler-sfc's type-driven macros like
// `defineProps<{ msg: string }>()`. So esbuild itself has to work here - see
// the setup script below.

export const VUE_VERSION = "3.5.42";
export const VITE_VERSION = "7.3.6";
export const PLUGIN_VUE_VERSION = "6.0.9";
// Kept even though nothing type-checks here: the scaffolded
// tsconfig.app.json extends it, and Vite's own esbuild transform reads
// that tsconfig before transforming a single .ts file.
export const VUE_TSCONFIG_VERSION = "^0.7.0";

export const VUE_TS_SETUP_SCRIPT_PATH = "scripts/duckwc-setup.mjs";

// esbuild's npm package normally ships a platform-native binary, and its
// Node entry point shells out to that binary over stdio. `overrides` already
// swaps the package for esbuild-wasm, whose own Node entry still spawns a
// child process for the same protocol; this replaces it with a direct call
// into esbuild-wasm's browser API, which instantiates the .wasm sitting in
// the very same package. Only the async surface is provided - the
// synchronous APIs cannot be backed by a WebAssembly.compile() at all, and
// nothing in Vite's dev-server path calls them.
const ESBUILD_BROWSER_ENTRY = `"use strict";
const fs = require("fs");
const browser = require("./browser.js");

let startup;
const ensureService = () => {
  if (!startup) {
    const bytes = fs.readFileSync(__dirname + "/../esbuild.wasm");
    startup = WebAssembly.compile(bytes).then((wasmModule) => browser.initialize({ wasmModule }));
  }
  return startup;
};

const withService = (method) => (...args) => ensureService().then(() => method(...args));
const unavailableSync = () => {
  throw new Error("duckwc: esbuild's synchronous APIs are unavailable in this browser sandbox.");
};

module.exports = {
  version: browser.version,
  build: withService(browser.build),
  buildSync: unavailableSync,
  context: withService(browser.context),
  transform: withService(browser.transform),
  transformSync: unavailableSync,
  analyzeMetafile: withService(browser.analyzeMetafile),
  analyzeMetafileSync: unavailableSync,
  formatMessages: withService(browser.formatMessages),
  formatMessagesSync: unavailableSync,
  initialize: ensureService,
  stop: () => browser.stop(),
};
`;

// Vite imports esbuild statically at the top of its own entry point, so this
// has to run in a separate process before `vite` starts - a plugin `config`
// hook is already too late. Hence the `&&` in the dev script rather than
// anything inside vite.config.js.
export function vueTsSetupScript(projectPath: string): string {
  return `import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ENTRY = "${projectPath}/node_modules/esbuild/lib/main.js";
const WASM = "${projectPath}/node_modules/esbuild/esbuild.wasm";
const PATCHED = ${JSON.stringify(ESBUILD_BROWSER_ENTRY)};

if (!existsSync(WASM)) {
  // Not the esbuild-wasm build - leave whatever is installed alone rather
  // than breaking it.
  console.log("[duckwc] esbuild.wasm not found; skipping the browser-entry patch.");
} else if (existsSync(ENTRY) && readFileSync(ENTRY, "utf8") === PATCHED) {
  console.log("[duckwc] esbuild already routed through its browser entry.");
} else {
  writeFileSync(ENTRY, PATCHED);
  console.log("[duckwc] routed esbuild through its browser entry.");
}
`;
}

export function vueTsViteConfig(projectPath: string): string {
  return `import vue from "@vitejs/plugin-vue";

export default {
  // Vue's browser ESM build is self-contained: no bare re-exports to follow
  // and no \`process.env.NODE_ENV\` left in it, which is exactly what the
  // dependency optimizer would otherwise be needed for. Pointing the bare
  // specifier straight at it leaves the optimizer nothing to do.
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
  resolve: {
    alias: {
      vue: "${projectPath}/node_modules/vue/dist/vue.runtime.esm-browser.js",
    },
  },
  plugins: [vue()],
};
`;
}
