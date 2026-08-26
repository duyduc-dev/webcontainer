// A permissive, POSIX-only reimplementation of Node's `path` module for guest
// scripts. Deliberately simpler than Node's real algorithm (see kernel/fs/path.ts
// for the stricter, absolute-only VFS variant this project also uses) — good
// enough for the join/dirname/basename/resolve patterns real packages rely on,
// not byte-for-byte identical to Node in every edge case.

function getCwd(): string {
  const proc = (globalThis as unknown as { process?: { cwd?: () => string } }).process;
  return typeof proc?.cwd === "function" ? proc.cwd() : "/";
}

function normalize(p: string): string {
  if (p === "") return ".";

  const isAbs = p.startsWith("/");
  const trailingSlash = p.length > 1 && p.endsWith("/");
  const stack: string[] = [];

  for (const segment of p.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") {
        stack.pop();
      } else if (!isAbs) {
        stack.push("..");
      }
      continue;
    }
    stack.push(segment);
  }

  let result = stack.join("/");
  if (isAbs) result = `/${result}`;
  if (result === "") result = isAbs ? "/" : ".";
  if (trailingSlash && !result.endsWith("/")) result += "/";
  return result;
}

function isAbsolute(p: string): boolean {
  return p.startsWith("/");
}

function join(...parts: string[]): string {
  const nonEmpty = parts.filter((part) => part !== "");
  if (nonEmpty.length === 0) return ".";
  return normalize(nonEmpty.join("/"));
}

function resolve(...parts: string[]): string {
  let resolved = "";
  let resolvedAbsolute = false;

  for (let i = parts.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    const part = i >= 0 ? parts[i] : getCwd();
    if (!part) continue;
    resolved = resolved === "" ? part : `${part}/${resolved}`;
    resolvedAbsolute = part.startsWith("/");
  }

  resolved = normalize(resolved);
  return resolvedAbsolute ? resolved : resolved || ".";
}

function dirname(p: string): string {
  if (p === "") return ".";
  const norm = normalize(p);
  if (norm === "/") return "/";
  const isAbs = norm.startsWith("/");
  const idx = norm.lastIndexOf("/");
  if (idx === -1) return isAbs ? "/" : ".";
  if (idx === 0) return "/";
  return norm.slice(0, idx);
}

function basename(p: string, suffix?: string): string {
  if (p === "") return "";
  const norm = normalize(p).replace(/\/+$/, "");
  const idx = norm.lastIndexOf("/");
  let base = idx === -1 ? norm : norm.slice(idx + 1);
  if (suffix && base.endsWith(suffix) && base !== suffix) {
    base = base.slice(0, base.length - suffix.length);
  }
  return base;
}

function extname(p: string): string {
  const base = basename(p);
  const idx = base.lastIndexOf(".");
  if (idx <= 0) return "";
  return base.slice(idx);
}

function relative(from: string, to: string): string {
  const fromParts = resolve(from).split("/").filter(Boolean);
  const toParts = resolve(to).split("/").filter(Boolean);

  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;

  const ups = fromParts.slice(i).map(() => "..");
  const downs = toParts.slice(i);
  const result = [...ups, ...downs].join("/");
  return result === "" ? "." : result;
}

type ParsedPath = { root: string; dir: string; base: string; ext: string; name: string };

function parse(p: string): ParsedPath {
  const root = isAbsolute(p) ? "/" : "";
  const base = basename(p);
  const ext = extname(base);
  const name = ext ? base.slice(0, -ext.length) : base;
  const dir = dirname(p);
  return { root, dir, base, ext, name };
}

function format(pathObject: Partial<ParsedPath>): string {
  const base = pathObject.base || `${pathObject.name ?? ""}${pathObject.ext ?? ""}`;
  const dir = pathObject.dir || pathObject.root || "";
  return dir ? `${dir.replace(/\/$/, "")}/${base}` : base;
}

const path = {
  sep: "/",
  delimiter: ":",
  normalize,
  isAbsolute,
  join,
  resolve,
  dirname,
  basename,
  extname,
  relative,
  parse,
  format,
};

(path as Record<string, unknown>).posix = path;
(path as Record<string, unknown>).win32 = path;

export default path;
