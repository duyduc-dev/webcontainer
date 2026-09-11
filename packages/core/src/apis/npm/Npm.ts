import type { FileSystemTree } from "../../kernel/fs/mount";
import type { FileSystemAPI } from "../FileSystem";
import { extractNpmTarball } from "./npmTar";

interface RegistryAbbreviatedDoc {
  "dist-tags": Record<string, string>;
  versions: Record<string, { dist: { tarball: string } }>;
}

const REGISTRY_BASE = "https://registry.npmjs.org";
const NPM_VFS_ROOT = "/usr/lib/node_modules/npm";

// node-gyp stub (real npm runs a package's install/rebuild lifecycle script,
// which for a native package is `node-gyp rebuild` - a non-zero exit there
// aborts the whole `npm install`). Native addons can't run in a browser
// sandbox at all, so this makes the build a non-fatal no-op instead - the
// package's JS/wasm fallback is what actually loads at runtime. npm
// resolves the `node-gyp` command to a shell shim it puts on PATH, which
// this runtime can't execute (no POSIX shell interpreter for that file), so
// the shim and the bundled node-gyp entry point are overwritten in place
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
const npmShim = (entry: string): string =>
  `require(${JSON.stringify(`${NPM_VFS_ROOT}/bin/${entry}`)});\n`;

// A narrow `pnpm` compatibility shim, not a real pnpm implementation -
// traced need: real rolldown's own `src/webcontainer-fallback.cjs` (its
// first-party fallback for exactly this class of sandbox, gated on
// `process.versions.webcontainer`) does `execFileSync('pnpm', ['i',
// bindingPkg], { cwd, stdio: 'inherit' })` to fetch its WASM binding. Rather
// than vendoring real pnpm (a whole separate, much larger CLI) just to
// satisfy this one call shape, this rewrites `pnpm i <pkg>` into the
// equivalent `npm install <pkg> --no-save` and hands off to the SAME real
// npm CLI this module already installs at /bin/npm.js - same technique as
// npmShim() above (mutate process.argv, then require() the real CLI entry in
// place), not a child spawn. Only the one shape rolldown's own fallback
// actually calls (`i`/`install` with exactly one package-spec positional
// arg) is supported; anything else exits non-zero with a clear message
// rather than silently doing the wrong thing.
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

interface NpmAsset {
  version: string;
  files: Record<string, string>;
}

interface NpmAPI {
  /** Unpacks an already-fetched npm asset into the VFS, neutralizes
   * node-gyp, and installs /bin/npm.js + /bin/npx.js + /bin/pnpm.js so
   * shell/process PATH search resolves the real CLI. Safe to call once at
   * boot. */
  load(asset: NpmAsset): Promise<{ version: string; fileCount: number }>;
  /** Convenience wrapper: fetch(url) a JSON-encoded NpmAsset, then load()
   * it. `url` is whatever a consumer's own build step produces - this
   * package doesn't ship or pin any particular npm version itself. See
   * examples/playground/scripts/vendor-npm.mjs for one way to build one. */
  loadFrom(url: string): Promise<{ version: string; fileCount: number }>;
  /** Zero-config: resolves `version` (default "latest") against the real npm
   * registry, fetches the real tarball, extracts it in-browser (gunzip +
   * ustar/PAX parsing - see npmTar.ts), and load()s the result. No local
   * build step or vendored asset required. */
  install(version?: string): Promise<{ version: string; fileCount: number }>;
}

/** The asset is a flat { relativePath: contents } map; dwc.fs.mount() wants
 * a nested FileSystemTree. */
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

const resolveTarballUrl = async (
  version: string,
): Promise<{ resolvedVersion: string; tarballUrl: string }> => {
  const response = await fetch(`${REGISTRY_BASE}/npm`, {
    headers: { Accept: "application/vnd.npm.install-v1+json" },
  });
  if (!response.ok) {
    throw new Error(
      `dwc.npm.install(): registry metadata request failed (${response.status})`,
    );
  }
  const doc = (await response.json()) as RegistryAbbreviatedDoc;
  const resolvedVersion =
    version === "latest" ? doc["dist-tags"].latest! : version;
  const versionDoc = doc.versions[resolvedVersion];
  if (!versionDoc)
    throw new Error(
      `dwc.npm.install(): npm@${resolvedVersion} not found in registry metadata`,
    );
  return { resolvedVersion, tarballUrl: versionDoc.dist.tarball };
};

/** Public `dwc.npm` facade - built entirely on top of `dwc.fs` (mount/
 * writeFile/mkdir/exists), not a new kernel request type: everything it
 * does is ordinary VFS setup a consuming app could otherwise do itself. */
const createNpmAPI = (fs: FileSystemAPI): NpmAPI => {
  const load: NpmAPI["load"] = async (asset) => {
    // mount()'s basePath is a prefix, never mkdir'd on its own - only nested
    // `directory` entries get created recursively. npm's own package root
    // has top-level FILES (package.json, LICENSE, ...), so if one of those
    // happens to be written before any directory entry creates the path,
    // writeFile() throws ENOENT against a not-yet-existing parent. Pre-create
    // the root explicitly.
    await fs.mkdir(NPM_VFS_ROOT, { recursive: true });
    await fs.mount(toFileSystemTree(asset.files), NPM_VFS_ROOT);

    for (const target of NODE_GYP_TARGETS) {
      if (await fs.exists(target)) await fs.writeFile(target, NODE_GYP_STUB);
    }

    await fs.mkdir("/bin", { recursive: true });
    await fs.writeFile("/bin/npm.js", npmShim("npm-cli.js"));
    await fs.writeFile("/bin/npx.js", npmShim("npx-cli.js"));
    await fs.writeFile("/bin/pnpm.js", PNPM_SHIM);

    return {
      version: asset.version,
      fileCount: Object.keys(asset.files).length,
    };
  };

  const loadFrom: NpmAPI["loadFrom"] = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `dwc.npm.loadFrom(): could not fetch ${url} (${response.status})`,
      );
    }
    return load((await response.json()) as NpmAsset);
  };

  const install: NpmAPI["install"] = async (version = "latest") => {
    const { resolvedVersion, tarballUrl } = await resolveTarballUrl(version);
    const tarballResponse = await fetch(tarballUrl);
    if (!tarballResponse.ok) {
      throw new Error(
        `dwc.npm.install(): could not fetch ${tarballUrl} (${tarballResponse.status})`,
      );
    }
    const files = await extractNpmTarball(
      new Uint8Array(await tarballResponse.arrayBuffer()),
    );
    return load({ version: resolvedVersion, files });
  };

  return { load, loadFrom, install };
};

export { createNpmAPI, NPM_VFS_ROOT };
export type { NpmAPI, NpmAsset };
