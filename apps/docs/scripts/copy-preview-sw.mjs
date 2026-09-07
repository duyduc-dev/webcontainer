import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Service Worker registration takes a plain same-origin URL, not a module
// specifier — there's no bundler magic that makes a node_modules file
// reachable at a stable public URL the way `new Worker(new URL(...))` is.
// So the built SW script has to be copied into Vite's public/ dir, which is
// served verbatim from the origin root.
const require = createRequire(import.meta.url);
const src = require.resolve("@dwc/core/preview-sw");
const dest = fileURLToPath(new URL("../public/dwc-preview-sw.js", import.meta.url));

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`copied preview service worker -> ${dest}`);
