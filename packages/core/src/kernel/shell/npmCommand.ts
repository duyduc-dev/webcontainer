import { ShellContext } from "./builtins";
import { resolvePackage } from "../registry/npmRegistry";
import { installPackage } from "../registry/installPackage";
import { resolvePath } from "./resolvePath";
import { FSError } from "../fs/FSError";

export type AsyncCommandResult = { exitCode: number; cwd?: string };
export type DataCallback = (stream: "stdout" | "stderr", chunk: string) => void;

function readPackageJson(ctx: ShellContext): Record<string, unknown> {
  const path = resolvePath(ctx.cwd, "package.json");
  try {
    const content = ctx.vfs.readFile(path);
    return JSON.parse(new TextDecoder().decode(content));
  } catch (error) {
    if (error instanceof FSError && error.code === "ENOENT") {
      throw new Error(`npm: no package.json found in ${ctx.cwd}`);
    }
    throw new Error(`npm: failed to parse package.json: ${String(error)}`);
  }
}

function parsePackageSpec(spec: string): { name: string; range: string } {
  const at = spec.lastIndexOf("@");
  if (at > 0) {
    return { name: spec.slice(0, at), range: spec.slice(at + 1) };
  }
  return { name: spec, range: "latest" };
}

async function runInstall(
  args: string[],
  ctx: ShellContext,
  onData: DataCallback,
): Promise<AsyncCommandResult> {
  const nodeModulesDir = resolvePath(ctx.cwd, "node_modules");
  const installed = new Set<string>();
  const queue: Array<{ name: string; range: string }> = [];

  if (args.length === 0) {
    let pkgJson: Record<string, unknown>;
    try {
      pkgJson = readPackageJson(ctx);
    } catch (error) {
      onData("stderr", `${String(error)}\n`);
      return { exitCode: 1 };
    }
    const deps = (pkgJson.dependencies ?? {}) as Record<string, string>;
    for (const [name, range] of Object.entries(deps))
      queue.push({ name, range });
  } else {
    for (const arg of args) queue.push(parsePackageSpec(arg));
  }

  if (queue.length === 0) {
    onData("stdout", "up to date, nothing to install\n");
    return { exitCode: 0 };
  }

  let installedCount = 0;
  while (queue.length > 0) {
    const { name, range } = queue.shift()!;
    if (installed.has(name)) continue;
    installed.add(name);

    try {
      onData("stdout", `resolving ${name}@${range}...\n`);
      const pkg = await resolvePackage(name, range);
      onData("stdout", `fetching ${pkg.name}@${pkg.version}...\n`);
      await installPackage(ctx.vfs, nodeModulesDir, pkg);
      installedCount++;

      for (const [depName, depRange] of Object.entries(pkg.dependencies)) {
        if (!installed.has(depName))
          queue.push({ name: depName, range: depRange });
      }
    } catch (error) {
      onData("stderr", `npm: failed to install ${name}: ${String(error)}\n`);
      return { exitCode: 1 };
    }
  }

  onData(
    "stdout",
    `added ${installedCount} package${installedCount === 1 ? "" : "s"}\n`,
  );
  return { exitCode: 0 };
}

export async function runNpm(
  args: string[],
  ctx: ShellContext,
  onData: DataCallback,
): Promise<AsyncCommandResult> {
  const [subcommand, ...rest] = args;
  if (subcommand === "install" || subcommand === "i") {
    return runInstall(rest, ctx, onData);
  }
  onData(
    "stderr",
    "npm: unsupported command. Try 'npm install' or 'npm install <package>'.\n",
  );
  return { exitCode: 1 };
}
