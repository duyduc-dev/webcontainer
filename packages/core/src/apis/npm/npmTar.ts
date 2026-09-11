const BLOCK = 512;

const SKIP_EXTENSIONS = new Set([
  ".map",
  ".md",
  ".markdown",
  ".html",
  ".png",
  ".gif",
  ".py",
  ".cmd",
  ".ps1",
]);

const gunzip = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** tar header numeric fields are ASCII octal, NUL/space terminated - except
 * GNU's base-256 extension (high bit of the first byte set), used for values
 * too large for octal's fixed width. npm's own files are all small, so this
 * mostly exists for header-field robustness, not because it's expected to
 * trigger. */
const readOctal = (
  bytes: Uint8Array,
  offset: number,
  length: number,
): number => {
  if ((bytes[offset]! & 0x80) !== 0) {
    let value = 0;
    for (let i = 1; i < length; i++) value = value * 256 + bytes[offset + i]!;
    return value;
  }
  let str = "";
  for (let i = 0; i < length; i++) {
    const byte = bytes[offset + i]!;
    if (byte === 0 || byte === 32) break;
    str += String.fromCharCode(byte);
  }
  return str ? parseInt(str, 8) : 0;
};

const readString = (
  bytes: Uint8Array,
  offset: number,
  length: number,
): string => {
  let end = offset;
  while (end < offset + length && bytes[end] !== 0) end++;
  return new TextDecoder().decode(bytes.subarray(offset, end));
};

/** PAX extended header body: a sequence of "<len> key=value\n" records,
 * `len` counting the whole record including itself and the trailing "\n". */
const parsePaxRecords = (data: Uint8Array): Record<string, string> => {
  const text = new TextDecoder().decode(data);
  const result: Record<string, string> = {};
  let i = 0;
  while (i < text.length) {
    const spaceIndex = text.indexOf(" ", i);
    if (spaceIndex === -1) break;
    const len = parseInt(text.slice(i, spaceIndex), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const recordEnd = i + len;
    const eq = text.indexOf("=", spaceIndex + 1);
    if (eq !== -1 && eq < recordEnd) {
      result[text.slice(spaceIndex + 1, eq)] = text.slice(
        eq + 1,
        recordEnd - 1,
      );
    }
    i = recordEnd;
  }
  return result;
};

interface TarEntry {
  path: string;
  contents: Uint8Array;
}

const parseTar = (buf: Uint8Array): TarEntry[] => {
  const entries: TarEntry[] = [];
  let offset = 0;
  let longNameOverride: string | null = null; // pending GNU 'L' entry
  let paxOverrides: Record<string, string> | null = null; // pending pax 'x'/'g' entry

  while (offset + BLOCK <= buf.length) {
    const header = buf.subarray(offset, offset + BLOCK);
    if (header.every((b) => b === 0)) break; // two all-zero blocks end the archive; one is enough to stop here

    const typeflag = String.fromCharCode(header[156] ?? 0);
    const size = readOctal(header, 124, 12);
    let name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    if (prefix) name = `${prefix}/${name}`;

    offset += BLOCK;
    const data = buf.subarray(offset, offset + size);
    offset += Math.ceil(size / BLOCK) * BLOCK; // data is padded to a 512-byte boundary

    if (typeflag === "L") {
      longNameOverride = new TextDecoder().decode(data).replace(/\0+$/, "");
      continue;
    }
    if (typeflag === "x" || typeflag === "g") {
      paxOverrides = parsePaxRecords(data);
      continue;
    }

    if (longNameOverride) {
      name = longNameOverride;
      longNameOverride = null;
    }
    if (paxOverrides?.path) name = paxOverrides.path;
    const effectiveSize = paxOverrides?.size
      ? parseInt(paxOverrides.size, 10)
      : size;
    paxOverrides = null;

    // '0'/'\0' = regular file. Directories ('5'), symlinks ('2'), etc. are
    // skipped - npm's own package ships none of the latter, and directories
    // are implied by file paths anyway (matches the existing build script).
    if (typeflag === "0" || typeflag === "\0") {
      entries.push({ path: name, contents: data.subarray(0, effectiveSize) });
    }
  }

  return entries;
};

/** Extracts a real npm-registry tarball (gzip+tar bytes) into a flat
 * { relativePath: contents } map - the shape NpmAsset.files expects. Strips
 * the standard `package/` prefix every registry tarball has, and skips the
 * same non-runtime extensions examples/playground/scripts/vendor-npm.mjs
 * already filtered out. */
const extractNpmTarball = async (
  gzipped: Uint8Array,
): Promise<Record<string, string>> => {
  const tarBytes = await gunzip(gzipped);
  const decoder = new TextDecoder();
  const files: Record<string, string> = {};

  for (const entry of parseTar(tarBytes)) {
    let path = entry.path.replace(/\0+$/, "");
    if (path.startsWith("package/")) path = path.slice("package/".length);
    if (!path || path.endsWith("/")) continue;
    if (SKIP_EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) continue;
    files[path] = decoder.decode(entry.contents);
  }

  return files;
};

export { extractNpmTarball };
