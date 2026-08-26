import { VirtualFileSystem } from "../fs/VirtualFileSystem";
import { dirname, join } from "../fs/path";
import { readTarEntries } from "./tar";
import { ResolvedPackage } from "./npmRegistry";

async function fetchTarball(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`npm: failed to fetch tarball ${url}: ${response.status}`);
  }
  const decompressed = response.body.pipeThrough(
    new DecompressionStream("gzip"),
  );
  const buffer = await new Response(decompressed).arrayBuffer();
  return new Uint8Array(buffer);
}

function stripPackagePrefix(name: string): string {
  const marker = "package/";
  return name.startsWith(marker) ? name.slice(marker.length) : name;
}

export async function installPackage(
  vfs: VirtualFileSystem,
  nodeModulesDir: string,
  pkg: ResolvedPackage,
): Promise<void> {
  const tarball = await fetchTarball(pkg.tarballUrl);
  const packageDir = join(nodeModulesDir, pkg.name);
  vfs.mkdir(packageDir, { recursive: true });

  for (const entry of readTarEntries(tarball)) {
    const relativePath = stripPackagePrefix(entry.name);
    if (relativePath === "") continue;
    const targetPath = join(packageDir, relativePath);

    if (entry.type === "dir") {
      vfs.mkdir(targetPath, { recursive: true });
    } else {
      vfs.mkdir(dirname(targetPath), { recursive: true });
      vfs.writeFile(targetPath, entry.content);
    }
  }
}
