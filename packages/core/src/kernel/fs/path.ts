import { FSError } from "./FSError";

export function isAbsolute(path: string): boolean {
  return path.startsWith("/");
}

export function normalize(path: string): string {
  if (!isAbsolute(path)) {
    throw new FSError("EINVAL", path, `path must be absolute: ${path}`);
  }

  const segments = path.split("/");
  const stack: string[] = [];

  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  return stack.length === 0 ? "/" : `/${stack.join("/")}`;
}

export function join(...segments: string[]): string {
  const nonEmpty = segments.filter((segment) => segment !== "");
  return normalize(nonEmpty.join("/"));
}

export function dirname(path: string): string {
  const normalized = normalize(path);
  if (normalized === "/") {
    return "/";
  }

  const lastSlash = normalized.lastIndexOf("/");
  const parent = normalized.slice(0, lastSlash);
  return parent === "" ? "/" : parent;
}

export function basename(path: string): string {
  const normalized = normalize(path);
  if (normalized === "/") {
    return "";
  }

  return normalized.slice(normalized.lastIndexOf("/") + 1);
}
