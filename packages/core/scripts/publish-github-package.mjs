import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const githubRegistry = "https://npm.pkg.github.com";
const githubPackageName = "@duyduc-dev/duckwc";
const rawArguments = process.argv.slice(2);
// pnpm preserves the separator used to forward script arguments, so
// `pnpm --filter duckwc publish:github -- --dry-run` reaches Node as
// `-- --dry-run`. Direct Node invocation has no separator.
const arguments_ = rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
const dryRun = arguments_.includes("--dry-run");

if (arguments_.length !== (dryRun ? 1 : 0)) {
  throw new Error("Usage: pnpm --filter duckwc publish:github -- [--dry-run]");
}

const coreDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(coreDirectory, "package.json");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "duckwc-github-package-"));
const packageDirectory = join(temporaryDirectory, "package");

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args[0]} exited with code ${code}`));
    });
  });
}

try {
  const sourceManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const githubManifest = {
    ...sourceManifest,
    name: githubPackageName,
    publishConfig: {
      access: "public",
      registry: githubRegistry,
    },
  };

  await cp(join(coreDirectory, "dist"), join(packageDirectory, "dist"), { recursive: true });
  await cp(join(coreDirectory, "README.md"), join(packageDirectory, "README.md"));
  await writeFile(join(packageDirectory, "package.json"), `${JSON.stringify(githubManifest, null, 2)}\n`);

  console.log(`Preparing ${githubPackageName}@${githubManifest.version} from packages/core/dist`);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  if (dryRun) {
    await run(npm, ["pack", "--dry-run"], packageDirectory);
  } else {
    await run(npm, ["publish", "--access=public", `--registry=${githubRegistry}`], packageDirectory);
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
