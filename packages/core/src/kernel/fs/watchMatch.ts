import { basename, dirname } from "./path";

/** One active fs.watch() registration - both `path` and any `changedPath`
 * passed to the functions below are assumed already-normalized absolute VFS
 * paths (workers/fs/worker.ts's own watch registry normalizes at
 * registration time; VirtualFileSystem's own onChange() always reports an
 * already-normalized path). */
interface WatchTarget {
  path: string;
  recursive: boolean;
}

/** Real Node's fs.watch(dir) (non-recursive) fires only for DIRECT children
 * of `dir`; fs.watch(dir, {recursive: true}) fires for a change at any
 * depth underneath it; fs.watch(file) fires only for that exact file. */
const matchesWatch = (watch: WatchTarget, changedPath: string): boolean => {
  if (changedPath === watch.path) return true;
  if (watch.recursive) {
    const prefix = watch.path === "/" ? "/" : `${watch.path}/`;
    return changedPath.startsWith(prefix);
  }
  return dirname(changedPath) === watch.path;
};

/** Real Node's fs.watch `filename` argument: relative to the watched path -
 * just the basename when the watched path IS the changed path (a direct,
 * non-directory watch target), otherwise the portion of `changedPath` past
 * `watchPath`. */
const watchFilename = (watchPath: string, changedPath: string): string => {
  if (changedPath === watchPath) return basename(changedPath);
  const prefix = watchPath === "/" ? "/" : `${watchPath}/`;
  return changedPath.slice(prefix.length);
};

export { matchesWatch, watchFilename };
export type { WatchTarget };
