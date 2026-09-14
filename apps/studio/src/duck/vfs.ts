import type { BootWCReturn } from "duckwc";

export interface DirEntryInfo {
  name: string;
  path: string;
  isDirectory: boolean;
}

const joinPath = (dir: string, name: string): string => (dir === "/" ? `/${name}` : `${dir}/${name}`);

// Lazily lists one directory level (not a full recursive walk) - a real
// project's node_modules can hold thousands of entries, so the explorer
// only stats what's actually expanded, matching how a real IDE's file tree
// works.
export async function listDirectory(dwc: BootWCReturn, path: string): Promise<DirEntryInfo[]> {
  const names = await dwc.fs.readdir(path);
  const entries = await Promise.all(
    names.map(async (name): Promise<DirEntryInfo> => {
      const childPath = joinPath(path, name);
      const stat = await dwc.fs.stat(childPath).catch(() => null);
      return { name, path: childPath, isDirectory: stat ? stat.isDirectory() : false };
    }),
  );

  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export async function readTextFile(dwc: BootWCReturn, path: string): Promise<string> {
  const bytes = await dwc.fs.readFile(path);
  return new TextDecoder().decode(bytes);
}

export async function writeTextFile(dwc: BootWCReturn, path: string, contents: string): Promise<void> {
  await dwc.fs.writeFile(path, contents);
}

const EXTENSION_META: Record<string, { color: string; badge: string }> = {
  tsx: { color: "#6366f1", badge: "TS" },
  ts: { color: "#6366f1", badge: "TS" },
  css: { color: "#a78bfa", badge: "#" },
  json: { color: "#eab308", badge: "{}" },
  html: { color: "#f97316", badge: "<>" },
  md: { color: "#71717a", badge: "M" },
  js: { color: "#eab308", badge: "JS" },
  jsx: { color: "#eab308", badge: "JS" },
  svg: { color: "#f97316", badge: "S" },
  gitignore: { color: "#71717a", badge: "G" },
};

export function fileMeta(name: string): { color: string; badge: string } {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return EXTENSION_META[ext] ?? { color: "#71717a", badge: "•" };
}

const MONACO_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  yml: "yaml",
  yaml: "yaml",
};

export function languageForPath(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return MONACO_LANGUAGE_BY_EXTENSION[ext] ?? "plaintext";
}
