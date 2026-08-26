import path from "./path";
import EventEmitter from "./events";
import util from "./util";

// Node's builtin names always win over node_modules, even if an npm package
// happens to share the name. `fs` is included here so preload.ts skips VFS
// resolution for it too, but it's handled separately in GuestWorker.ts since
// (unlike these three) it needs boot-time data injected, not just a pure value.
export const ALL_BUILTIN_MODULE_NAMES = new Set(["path", "events", "util", "fs"]);

const pureBuiltins: Record<string, () => unknown> = {
  path: () => path,
  events: () => EventEmitter,
  util: () => util,
};

const instances = new Map<string, unknown>();

export function loadPureBuiltin(name: string): unknown | undefined {
  if (!(name in pureBuiltins)) return undefined;
  if (!instances.has(name)) {
    instances.set(name, pureBuiltins[name]());
  }
  return instances.get(name);
}
