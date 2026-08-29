import EventEmitter from "./events";

// No real process spawning is possible inside a Worker sandbox. This stub
// exists so `require("child_process")` doesn't hard-crash module loading for
// packages that import it at the top level even when they only conditionally
// call it — invoking any of these fails clearly (asynchronously, via an
// 'error' event/callback, matching how a real spawn() ENOENT reports)
// instead of hanging or silently no-op'ing.
const UNSUPPORTED_MESSAGE = "child_process is not supported in this browser sandbox";

type Callback = (error: Error) => void;

function unsupportedChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: () => boolean; end: () => void };
    pid: undefined;
    killed: boolean;
    kill: () => boolean;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: () => false, end: () => {} };
  child.pid = undefined;
  child.killed = false;
  child.kill = () => false;
  setTimeout(() => child.emit("error", new Error(UNSUPPORTED_MESSAGE)), 0);
  return child;
}

function withCallback(rest: unknown[]) {
  const callback = rest.find((arg): arg is Callback => typeof arg === "function");
  if (callback) setTimeout(() => callback(new Error(UNSUPPORTED_MESSAGE)), 0);
  return unsupportedChild();
}

function unsupportedSync(): never {
  throw new Error(UNSUPPORTED_MESSAGE);
}

export default {
  spawn: unsupportedChild,
  fork: unsupportedChild,
  exec: (_command: string, ...rest: unknown[]) => withCallback(rest),
  execFile: (_file: string, ...rest: unknown[]) => withCallback(rest),
  spawnSync: unsupportedSync,
  execSync: unsupportedSync,
  execFileSync: unsupportedSync,
};
