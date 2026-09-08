// Node's `child_process` — hand-written, not vendored. Real Node's
// lib/child_process.js reaches libuv process spawning through
// internalBinding('spawn_sync')/'process_wrap', neither of which translates
// to a Worker-based sandbox any more directly than net.js's TCP/pipe handles
// did (see bindings/net.ts's own header for that same reasoning).
//
// spawn/exec/execFile are async. execFileSync is real, backed by its own
// SharedArrayBuffer sync kernel bridge (the same kind Phase 4/5 built for
// fs.*Sync - see workers/process/syncExecClient.ts and
// workers/kernel/processClient.ts's createSyncExecChannelFor) - traced need:
// real rolldown's own WebContainer-detection fallback calls it directly to
// fetch its WASM binding via `pnpm i`. spawnSync/execSync don't have a
// traced need yet and still throw a clear error rather than silently doing
// the wrong thing.
//
// No child.stdin: there is no bidirectional byte relay from a parent's
// guest code down into an already-running child's stdin yet (the same cut
// Phase 8c made for `cat`'s stdin fallback — no stdin plumbing exists in
// this runtime at all today). child.stdin is always null.
export default function (exports, require, module, process, internalBinding, primordials) {
  const EventEmitter = require("events");
  const { Readable } = require("stream");
  const cp = internalBinding("child_process");

  const notImplemented = (name) => () => {
    throw new Error(`child_process.${name} is not implemented yet (needs a synchronous kernel bridge)`);
  };

  // Real Node's `stdio` option resolves per-fd: a bare string ('pipe'
  // (default) | 'ignore' | 'inherit') applies to all three streams, an
  // array gives each fd its own mode. Only fd 1/2 (stdout/stderr) matter
  // here - there's no child.stdin plumbing at all yet (see this file's own
  // header comment).
  const stdioModeFor = (stdio, fd) => {
    if (Array.isArray(stdio)) return stdio[fd] ?? "pipe";
    return stdio ?? "pipe";
  };

  class ChildProcess extends EventEmitter {
    constructor(command, args, options) {
      super();
      this.pid = -1;
      this.exitCode = null;
      this.signalCode = null;
      this.killed = false;
      this.spawnfile = command;
      this.spawnargs = [command, ...args];
      // read()=noop: data arrives pushed from the kernel relay as it comes in
      // (workers/kernel/processClient.ts's "cp-spawn" forwarding), exactly
      // like a real child's piped stdio. 'inherit' mode gets no Readable at
      // all (null, matching real Node exactly) - see spawn()'s own onStdout/
      // onStderr wiring for where that stream's chunks actually go instead.
      const stdio = options ? options.stdio : undefined;
      this.stdout = stdioModeFor(stdio, 1) === "pipe" ? new Readable({ read() {} }) : null;
      this.stderr = stdioModeFor(stdio, 2) === "pipe" ? new Readable({ read() {} }) : null;
      this.stdin = null;
      this.stdio = [this.stdin, this.stdout, this.stderr];
      this._handle = null;
    }
    kill() {
      if (this.killed || !this._handle) return false;
      this.killed = true;
      this._handle.kill();
      return true;
    }
    ref() {
      return this;
    }
    unref() {
      return this;
    }
  }

  function normalizeArgs(command, args, options) {
    if (!Array.isArray(args)) {
      options = args || {};
      args = [];
    }
    return { command, args: args || [], options: options || {} };
  }

  function spawn(command, args, options) {
    const norm = normalizeArgs(command, args, options);
    const child = new ChildProcess(norm.command, norm.args, norm.options);
    const cwd = norm.options.cwd || process.cwd();
    const env = norm.options.env || process.env;
    const stdio = norm.options.stdio;
    // Real Node's 'inherit' shares the OS file descriptor directly with the
    // parent - a grandchild's output reaches the original terminal with no
    // userland code involved at all, no readable stream to speak of. There's
    // no such OS-level primitive here, so this is the closest real
    // equivalent: write straight to THIS process's own stdout/stderr as
    // chunks arrive, instead of buffering into a (real-Node: nonexistent,
    // see ChildProcess's own constructor) child.stdout/stderr Readable no
    // 'inherit'-mode caller ever reads from anyway. Traced need: real npm's
    // own @npmcli/run-script always launches scripts (including npm exec/
    // npx's fetched-package launch) with `stdio: 'inherit'` - without this,
    // a failing scaffolder's own error output (the one piece of information
    // that actually explains why it failed) went nowhere, silently, while
    // npm's own wrapping error message stayed as uninformative as ever.
    const forwardStdout = stdioModeFor(stdio, 1) === "inherit" ? (chunk) => process.stdout.write(chunk) : (chunk) => child.stdout.push(chunk);
    const forwardStderr = stdioModeFor(stdio, 2) === "inherit" ? (chunk) => process.stderr.write(chunk) : (chunk) => child.stderr.push(chunk);

    child._handle = cp.spawn(norm.command, norm.args, cwd, env, {
      onStdout: forwardStdout,
      onStderr: forwardStderr,
      onExit: (code, errorMessage) => {
        if (child.stdout) child.stdout.push(null);
        if (child.stderr) child.stderr.push(null);
        if (errorMessage != null) {
          const err = new Error(errorMessage);
          err.code = "ENOENT";
          // Real Node emits 'error' before 'exit'/'close' for a failed spawn -
          // callers that race a promise on both (e.g. real npm's own
          // @npmcli/promise-spawn: `.on('error', reject)` and `.on('close',
          // (code, signal) => code || signal ? reject() : resolve())`) rely on
          // that order, since a Promise's first settlement wins and 'close'
          // fires with code=null/signal=null here (both falsy - there is no
          // real exit code for a command that never ran), which reads as
          // success unless 'error' gets there first. All three deferred into
          // the same nextTick (not just 'error' alone) keeps that order while
          // still giving a caller who attaches its own 'error' listener
          // asynchronously time to do so before any of these fire.
          process.nextTick(() => {
            child.emit("error", err);
            child.emit("exit", null, null);
            child.emit("close", null, null);
          });
          return;
        }
        child.exitCode = code;
        child.emit("exit", code, null);
        child.emit("close", code, null);
      },
    });
    return child;
  }

  function execFile(file, args, options, callback) {
    if (typeof args === "function") {
      callback = args;
      args = [];
      options = {};
    } else if (typeof options === "function") {
      callback = options;
      options = {};
    }
    args = args || [];
    options = options || {};
    const encoding = options.encoding !== undefined ? options.encoding : "utf8";

    const child = spawn(file, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString(encoding);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString(encoding);
    });
    child.on("error", (err) => {
      if (typeof callback === "function") callback(err, stdout, stderr);
    });
    child.on("close", (code) => {
      if (typeof callback !== "function") return;
      if (code) {
        const err = new Error(`Command failed: ${[file, ...args].join(" ")}\n${stderr}`);
        err.code = code;
        callback(err, stdout, stderr);
      } else {
        callback(null, stdout, stderr);
      }
    });
    return child;
  }

  // Runs the WHOLE command string through this runtime's own shell
  // (workers/kernel/processClient.ts's runShell — the same one
  // dwc.shell.exec() uses), not a literal /bin/sh: there is no vendored
  // POSIX shell here (Phase 8c kept a &&/>-only tokenizer, not a full
  // interpreter). Real &&/>/PATH-coreutils support comes along for
  // free as a result. That shell doesn't track stdout/stderr separately
  // (see runShellInternal's single `output` accumulator), so both callback
  // arguments carry the same combined, in-order text; stderr alone is never
  // populated — a known, documented simplification, not a bug.
  //
  // Unlike spawn()/execFile(), there is no live process handle to return:
  // the whole line runs kernel-side as a single buffered round trip, not a
  // spawned child this process holds a reference to, so real Node's
  // ChildProcess-with-.kill() return value isn't available here.
  function exec(command, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    options = options || {};
    const cwd = options.cwd || process.cwd();

    cp.exec(command, cwd).then(
      (result) => {
        if (typeof callback !== "function") return;
        if (result.exitCode) {
          const err = new Error(`Command failed: ${command}\n${result.output}`);
          err.code = result.exitCode;
          callback(err, result.output, "");
        } else {
          callback(null, result.output, "");
        }
      },
      (error) => {
        if (typeof callback === "function") callback(error, "", "");
      },
    );
    return undefined;
  }

  // Genuinely, fully synchronous - blocks this worker thread (via
  // cp.execFileSync()'s own Atomics.wait bridge) until the spawned program
  // has actually exited. Combines stdout+stderr into one string, same
  // documented simplification as exec() above (this runtime's process-event
  // plumbing doesn't track them separately) - real Node's own `.stdout`/
  // `.stderr` on a thrown error would differ; here both carry the same
  // combined text, which is enough for what actually reads them today (real
  // rolldown's own WebContainer fallback never inspects execFileSync's
  // return value or a thrown error's fields at all - it only cares that the
  // call blocks and throws on a non-zero exit).
  function execFileSync(file, args, options) {
    const norm = normalizeArgs(file, args, options);
    const cwd = norm.options.cwd || process.cwd();
    const env = norm.options.env || process.env;

    const result = cp.execFileSync(norm.command, norm.args, cwd, env);
    if (result.exitCode !== 0) {
      const err = new Error(`Command failed: ${[norm.command, ...norm.args].join(" ")}\n${result.output}`);
      err.status = result.exitCode;
      err.stdout = result.output;
      err.stderr = result.output;
      throw err;
    }
    return result.output;
  }

  exports.ChildProcess = ChildProcess;
  exports.spawn = spawn;
  exports.execFile = execFile;
  exports.exec = exec;
  exports.execFileSync = execFileSync;
  exports.spawnSync = notImplemented("spawnSync");
  exports.execSync = notImplemented("execSync");
}
