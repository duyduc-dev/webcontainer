import path from "./path";
import EventEmitter from "./events";
import util from "./util";
import os from "./os";
import url from "./url";
import childProcess from "./child_process";
import { Buffer } from "./buffer";

// Node's builtin names always win over node_modules, even if an npm package
// happens to share the name. `fs` and `http` are included here so preload.ts
// skips VFS resolution for them too, but they're handled separately in
// GuestWorker.ts since (unlike the others) they need boot-time data/postMessage
// access injected, not just a pure value.
export const ALL_BUILTIN_MODULE_NAMES = new Set([
  "path",
  "events",
  "util",
  "fs",
  "http",
  "os",
  "url",
  "child_process",
  "buffer",
]);

const pureBuiltins: Record<string, () => unknown> = {
  path: () => path,
  events: () => EventEmitter,
  util: () => util,
  os: () => os,
  url: () => url,
  child_process: () => childProcess,
  buffer: () => ({ Buffer }),
};

const instances = new Map<string, unknown>();

export function loadPureBuiltin(name: string): unknown | undefined {
  if (!(name in pureBuiltins)) return undefined;
  if (!instances.has(name)) {
    instances.set(name, pureBuiltins[name]());
  }
  return instances.get(name);
}
