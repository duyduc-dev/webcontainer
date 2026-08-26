// A deliberately scoped `fs` shim: read-only, synchronous, and limited to
// absolute literal paths discovered by preload.ts's static scan (same
// limitation as require() — a computed path isn't found ahead of time and
// fails clearly at runtime instead of silently misbehaving). Relative-path
// resolution isn't supported since, unlike require(), fs calls have no
// natural "which module is calling this" context to resolve against.
export function createFsModule(files: Map<string, string>) {
  return {
    readFileSync(path: string, encoding?: string): string | Uint8Array {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(
          `ENOENT: no such file or directory, open '${path}' (only absolute literal paths discovered ahead of time are supported)`,
        );
      }
      return encoding ? content : new TextEncoder().encode(content);
    },
    existsSync(path: string): boolean {
      return files.has(path);
    },
  };
}
