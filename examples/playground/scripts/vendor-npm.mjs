// vendor-npm — pack a real, pinned npm release into public/vendor/npm.json,
// a gitignored build artifact fetched once at runtime and unpacked into the
// VFS (see src/vendorNpm.ts). Modeled on vivari's own scripts/vendor-npm.mjs
// (github.com/maitrungduc1410/vivari, MIT): vendor a pinned npm into a
// scratch dir with the host's own npm/network (needed once), then pack it.
//
// Unlike vivari's custom binary archive (they control both ends and wanted
// to dodge tar's long-path edge cases), this writes a plain JSON
// { relativePath: contents } map - simpler, and fine for a local dev asset
// that isn't shipped to end users. Non-runtime weight is dropped: source
// maps, docs (.md/.html), images, node-gyp's own bundled .py (node-gyp is
// fully stubbed at runtime - see vendorNpm.ts - so it's never actually
// invoked), and Windows-only launcher scripts (.cmd/.ps1 - this VFS is
// POSIX-only).
//
// Usage: node scripts/vendor-npm.mjs [--force]

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NPM_VERSION = "10.9.2";
const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const VENDOR_DIR = process.env.DWC_VENDOR_DIR || path.join(ROOT, ".vendor-scratch");
const VENDOR_NPM = path.join(VENDOR_DIR, "node_modules", "npm");
const OUT_FILE = path.join(ROOT, "public", "vendor", "npm.json");

const SKIP_EXTENSIONS = new Set([".map", ".md", ".markdown", ".html", ".png", ".gif", ".py", ".cmd", ".ps1"]);

const force = process.argv.includes("--force");

function log(message) {
  process.stderr.write(`[vendor-npm] ${message}\n`);
}

if (fs.existsSync(OUT_FILE) && !force) {
  log(`asset already present: ${path.relative(ROOT, OUT_FILE)} (use --force to rebuild)`);
  process.exit(0);
}

if (!fs.existsSync(path.join(VENDOR_NPM, "bin", "npm-cli.js")) || force) {
  log(`installing npm@${NPM_VERSION} into ${VENDOR_DIR} ...`);
  fs.rmSync(VENDOR_DIR, { recursive: true, force: true });
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  try {
    execSync(`npm install npm@${NPM_VERSION} --no-save --no-audit --no-fund --loglevel=error`, {
      cwd: VENDOR_DIR,
      stdio: ["ignore", "ignore", "inherit"],
    });
  } catch (error) {
    log(`FAILED to vendor npm (need network + host npm): ${error && error.message}`);
    process.exit(1);
  }
} else {
  log(`reusing vendored npm at ${VENDOR_NPM}`);
}

if (!fs.existsSync(path.join(VENDOR_NPM, "bin", "npm-cli.js"))) {
  log("vendored npm is missing bin/npm-cli.js - aborting");
  process.exit(1);
}

/** @type {Record<string, string>} */
const files = {};
let skipped = 0;

function walk(dir, rel) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(abs, relPath);
      continue;
    }
    if (!entry.isFile()) continue; // skip symlinks - npm's own package ships none
    if (SKIP_EXTENSIONS.has(path.extname(entry.name))) {
      skipped++;
      continue;
    }
    files[relPath] = fs.readFileSync(abs, "utf8");
  }
}
walk(VENDOR_NPM, "");

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify({ version: NPM_VERSION, files }));

const sizeMb = (fs.statSync(OUT_FILE).size / 1e6).toFixed(1);
log(`wrote ${Object.keys(files).length} files (skipped ${skipped}) -> ${path.relative(ROOT, OUT_FILE)} (${sizeMb} MB)`);
