import semver from "semver";

export type ResolvedPackage = {
  name: string;
  version: string;
  tarballUrl: string;
  dependencies: Record<string, string>;
};

type PackageMeta = {
  name: string;
  "dist-tags": Record<string, string>;
  versions: Record<
    string,
    { dist: { tarball: string }; dependencies?: Record<string, string> }
  >;
};

async function fetchMeta(name: string): Promise<PackageMeta> {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
  );
  if (!response.ok) {
    throw new Error(
      `npm: failed to fetch metadata for ${name}: ${response.status}`,
    );
  }
  return response.json();
}

function resolveVersion(meta: PackageMeta, range: string): string {
  const distTag = meta["dist-tags"][range];
  if (distTag) return distTag;

  const versions = Object.keys(meta.versions);
  const best = semver.maxSatisfying(versions, range);
  if (!best) {
    throw new Error(`npm: no version of ${meta.name} satisfies ${range}`);
  }
  return best;
}

export async function resolvePackage(
  name: string,
  range: string,
): Promise<ResolvedPackage> {
  const meta = await fetchMeta(name);
  const version = resolveVersion(meta, range || "latest");
  const versionMeta = meta.versions[version];
  if (!versionMeta) {
    throw new Error(`npm: no metadata for ${name}@${version}`);
  }

  return {
    name,
    version,
    tarballUrl: versionMeta.dist.tarball,
    dependencies: versionMeta.dependencies ?? {},
  };
}
