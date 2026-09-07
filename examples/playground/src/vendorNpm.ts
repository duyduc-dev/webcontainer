import type { BootDWCReturn, FileSystemTree } from "@dwc/core";

const NPM_VFS_ROOT = "/usr/lib/node_modules/npm";

// node-gyp stub (real npm runs a package's install/rebuild lifecycle script,
// which for a native package is `node-gyp rebuild` - a non-zero exit there
// aborts the whole `npm install`). Native addons can't run in a browser
// sandbox at all, so this makes the build a non-fatal no-op instead - the
// package's JS/wasm fallback is what actually loads at runtime. Ported
// directly from vivari's own node-gyp-stub.js (github.com/maitrungduc1410/vivari,
// MIT): npm resolves the `node-gyp` command to a shell shim it puts on PATH,
// which this runtime can't execute (no POSIX shell interpreter for that file),
// so the shim and the bundled node-gyp entry point are overwritten in place
// with this plain Node program instead.
const NODE_GYP_STUB = `const argv = process.argv.slice(2);
const verb = argv.find((a) => a && a[0] !== '-') || '';
if (argv.includes('-v') || argv.includes('--version')) {
  process.stdout.write('v11.0.0\\n');
  process.exit(0);
}
process.stderr.write(
  'node-gyp (stub): skipping native build' +
    (verb ? " '" + verb + "'" : '') +
    ' - native addons are not supported in-browser; using the package\\'s JS/wasm fallback\\n',
);
process.exit(0);
`;

const NODE_GYP_TARGETS = [
  `${NPM_VFS_ROOT}/node_modules/@npmcli/run-script/lib/node-gyp-bin/node-gyp`,
  `${NPM_VFS_ROOT}/bin/node-gyp-bin/node-gyp`,
  `${NPM_VFS_ROOT}/node_modules/node-gyp/bin/node-gyp.js`,
];

/** Thin shims on PATH: npm-cli.js/npx-cli.js read process.argv (argv[1] =
 * this shim's own path, the rest their real args), exactly like running the
 * real file directly - `require()`ing it by absolute VFS path is the concrete
 * case moduleLoader.ts's absolute-path require() support was added for. */
const npmShim = (entry: string): string => `require(${JSON.stringify(`${NPM_VFS_ROOT}/bin/${entry}`)});\n`;

// A narrow `pnpm` compatibility shim, not a real pnpm implementation -
// traced need: real rolldown's own `src/webcontainer-fallback.cjs` (its
// first-party fallback for exactly this class of sandbox, gated on
// `process.versions.webcontainer` - see @dwc/core's own worker.ts comment on
// that marker) does `execFileSync('pnpm', ['i', bindingPkg], { cwd, stdio:
// 'inherit' })` to fetch its WASM binding. Rather than vendoring real pnpm
// (a whole separate, much larger CLI) just to satisfy this one call shape,
// this rewrites `pnpm i <pkg>` into the equivalent `npm install <pkg>
// --no-save` and hands off to the SAME real, already-vendored npm CLI this
// file already installs at /bin/npm.js - same technique as npmShim() above
// (mutate process.argv, then require() the real CLI entry in place), not a
// child spawn. Only the one shape rolldown's own fallback actually calls
// (`i`/`install` with exactly one package-spec positional arg) is
// supported; anything else exits non-zero with a clear message rather than
// silently doing the wrong thing.
const PNPM_SHIM = `const argv = process.argv.slice(2);
const sub = argv[0];
const pkg = argv[1];
if ((sub === 'i' || sub === 'install') && pkg && argv.length === 2) {
  process.argv.length = 2;
  process.argv.push('install', pkg, '--no-save', '--no-audit', '--no-fund', '--loglevel=warn');
  require(${JSON.stringify(`${NPM_VFS_ROOT}/bin/npm-cli.js`)});
} else {
  process.stderr.write('pnpm (shim): only "pnpm i <package>" is supported in this runtime (real pnpm is not vendored - this delegates to the real npm CLI instead)\\n');
  process.exit(1);
}
`;

interface FlatNpmAsset {
  version: string;
  files: Record<string, string>;
}

/** The fetched asset is a flat { relativePath: contents } map (see
 * scripts/vendor-npm.mjs); dwc.fs.mount() wants a nested FileSystemTree. */
const toFileSystemTree = (files: Record<string, string>): FileSystemTree => {
  const root: FileSystemTree = {};

  for (const [relPath, contents] of Object.entries(files)) {
    const segments = relPath.split("/");
    const fileName = segments.pop()!;

    let dir = root;
    for (const segment of segments) {
      const existing = dir[segment];
      if (existing && "directory" in existing) {
        dir = existing.directory;
        continue;
      }
      const nested: FileSystemTree = {};
      dir[segment] = { directory: nested };
      dir = nested;
    }
    dir[fileName] = { file: { contents } };
  }

  return root;
};

/**
 * Fetches the vendored npm asset, unpacks it into the VFS, neutralizes
 * node-gyp, and installs /bin/npm.js + /bin/npx.js so the shell resolves the
 * real CLI. Safe to call once at boot; throws if the asset was never built
 * (`node scripts/vendor-npm.mjs`, wired as this app's `predev`/`prebuild`).
 */
const loadVendoredNpm = async (dwc: BootDWCReturn): Promise<{ version: string; fileCount: number }> => {
  const response = await fetch("/vendor/npm.json");
  if (!response.ok) {
    throw new Error(`Could not fetch /vendor/npm.json (${response.status}) - run "node scripts/vendor-npm.mjs" first`);
  }
  const asset = (await response.json()) as FlatNpmAsset;

  // mount()'s basePath is a prefix, never mkdir'd on its own - only nested
  // `directory` entries get created recursively (see kernel/fs/mount.ts). npm's
  // own package root has top-level FILES (package.json, LICENSE, ...), so if
  // one of those happens to be written before any directory entry creates the
  // path, writeFile() throws ENOENT against a not-yet-existing parent - the
  // exact bug Phase 8c hit seeding /bin. Pre-create the root explicitly.
  await dwc.fs.mkdir(NPM_VFS_ROOT, { recursive: true });
  await dwc.fs.mount(toFileSystemTree(asset.files), NPM_VFS_ROOT);

  for (const target of NODE_GYP_TARGETS) {
    if (await dwc.fs.exists(target)) await dwc.fs.writeFile(target, NODE_GYP_STUB);
  }

  await dwc.fs.mkdir("/bin", { recursive: true });
  await dwc.fs.writeFile("/bin/npm.js", npmShim("npm-cli.js"));
  await dwc.fs.writeFile("/bin/npx.js", npmShim("npx-cli.js"));
  await dwc.fs.writeFile("/bin/pnpm.js", PNPM_SHIM);

  return { version: asset.version, fileCount: Object.keys(asset.files).length };
};

export { loadVendoredNpm, NPM_VFS_ROOT };
