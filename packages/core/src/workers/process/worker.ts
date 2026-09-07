import { createBuiltinModules } from "../../runtime/builtins";
import { createFsBuiltin, createFsPromisesBuiltin } from "../../runtime/builtins/fs";
import type { FsBuiltin, FsBuiltinIO } from "../../runtime/builtins/fs";
import { createEventLoop } from "../../runtime/eventLoop";
import { createModuleLoader } from "../../runtime/moduleLoader";
import { FsOp } from "../../kernel/fs/syncWireFormat";
import { callSyncFs } from "./syncFsClient";
import type { SyncFsChannel } from "./syncFsClient";
import { callSyncExec } from "./syncExecClient";
import type { SyncExecChannel } from "./syncExecClient";
import { DWCError, ERR_NOT_ISOLATED } from "../../protocol/errors";
import { postEvent } from "./service";

interface SyncFsChannelPayload {
  port: MessagePort;
  control: SharedArrayBuffer;
  data: SharedArrayBuffer;
}

interface SyncExecChannelPayload {
  port: MessagePort;
  control: SharedArrayBuffer;
  data: SharedArrayBuffer;
}

interface BootPayload {
  entryPath: string;
  sources: Record<string, string>;
  argv: string[];
  env: Record<string, string>;
  cwd: string;
  syncFs: SyncFsChannelPayload | null;
  syncExec: SyncExecChannelPayload | null;
}

interface NetReply {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  bodyBytes: ArrayBuffer;
}

interface NetRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
}

interface PipeRelayMessage {
  type: "pipe-open" | "pipe-data" | "pipe-shutdown" | "pipe-close";
  connId: number;
  path?: string;
  chunk?: Uint8Array;
}

interface ChildProcessSpawnHandlers {
  onStdout(chunk: Uint8Array): void;
  onStderr(chunk: Uint8Array): void;
  onExit(code: number | null, errorMessage?: string): void;
}

const encoder = new TextEncoder();

let exitCode = 0;
let exited = false;
const pendingNetRequests = new Map<string, { resolve: (reply: NetReply) => void; reject: (error: unknown) => void }>();
const pendingPipeConnects = new Map<string, { resolve: (v: { connId: number }) => void; reject: (error: unknown) => void }>();
let pipeMessageHandler: ((msg: PipeRelayMessage) => void) | null = null;
// Set inside boot() once process.stdin (a real vendored Readable) exists -
// routes an incoming "stdin" message (dwc.process.spawn()'s host-facing
// .stdin WritableStream, relayed through the kernel) into it. null until
// boot() runs, same as pipeMessageHandler right above.
let stdinPush: ((chunk: Uint8Array) => void) | null = null;
const childSpawnHandlers = new Map<string, ChildProcessSpawnHandlers>();
const pendingChildExecs = new Map<
  string,
  { resolve: (v: { output: string; cwd: string; exitCode: number }) => void; reject: (error: unknown) => void }
>();

/** Bridges the guest realm's globalThis.__dwcFetchAsync (see internal/fetch-transport.js)
 * up through the kernel to the Fetcher Worker — the only place with real network access.
 * Refs the event loop for the duration, since a reply arrives via a real message from
 * another worker, not anything the loop already tracks (a timer/immediate/nextTick). */
const createNetRequest = (eventLoop: ReturnType<typeof createEventLoop>) => {
  return (url: string, init: NetRequestInit = {}): Promise<NetReply> => {
    const id = crypto.randomUUID();
    eventLoop.ref();
    return new Promise<NetReply>((resolve, reject) => {
      pendingNetRequests.set(id, {
        resolve: (reply) => {
          eventLoop.unref();
          resolve(reply);
        },
        reject: (error) => {
          eventLoop.unref();
          reject(error);
        },
      });
      // Copy (never transfer) the body: a Node Buffer may be a view over a
      // shared/pooled ArrayBuffer, and transferring it would detach that pool
      // out from under any other Buffer still referencing it.
      const body = init.body ? init.body.slice().buffer : undefined;
      self.postMessage({
        type: "net-request",
        payload: { id, url, method: init.method, headers: init.headers, body },
      });
    });
  };
};

const handleNetResponse = (payload: { id: string; ok: boolean; result?: NetReply; error?: { code: string; message: string } }): void => {
  const waiting = pendingNetRequests.get(payload.id);
  if (!waiting) return;
  pendingNetRequests.delete(payload.id);

  if (payload.ok) waiting.resolve(payload.result!);
  else waiting.reject(Object.assign(new Error(payload.error!.message), { code: payload.error!.code }));
};

/** The process-worker half of 'net's cross-process relay (see
 * workers/kernel/netRelay.ts) — a plain postMessage bridge up to the kernel,
 * mirroring createNetRequest's shape. listen()/pipeListen() are fire-and-
 * forget; pipeConnect() refs the loop for the round trip, same reasoning as
 * createNetRequest (the reply arrives via a message from another worker, not
 * anything the loop already tracks). */
const createNetBridge = (eventLoop: ReturnType<typeof createEventLoop>) => ({
  listen: (port: number): void => self.postMessage({ type: "net-listen", payload: { port } }),
  closeServer: (port: number): void => self.postMessage({ type: "net-close-server", payload: { port } }),
  pipeListen: (key: string): void => self.postMessage({ type: "net-pipe-listen", payload: { key } }),
  pipeCloseServer: (key: string): void => self.postMessage({ type: "net-pipe-close-server", payload: { key } }),
  pipeConnect: (key: string): Promise<{ connId: number }> => {
    const id = crypto.randomUUID();
    eventLoop.ref();
    return new Promise((resolve, reject) => {
      pendingPipeConnects.set(id, {
        resolve: (v) => {
          eventLoop.unref();
          resolve(v);
        },
        reject: (error) => {
          eventLoop.unref();
          reject(error);
        },
      });
      self.postMessage({ type: "net-pipe-connect", payload: { id, key } });
    });
  },
  postRaw: (msg: PipeRelayMessage): void => self.postMessage({ type: "net-pipe-relay", payload: msg }),
  onMessage: (handler: (msg: PipeRelayMessage) => void): void => {
    pipeMessageHandler = handler;
  },
});

const handlePipeConnectResponse = (payload: { id: string; connId: number }): void => {
  const waiting = pendingPipeConnects.get(payload.id);
  if (!waiting) return;
  pendingPipeConnects.delete(payload.id);
  waiting.resolve({ connId: payload.connId });
};

/** The process-worker half of child_process's guest-to-kernel relay (see
 * workers/kernel/processClient.ts's "cp-spawn"/"cp-exec" handling inside
 * bootProcess()). spawn() is an ongoing relay (stdout/stderr/exit events
 * tagged by request id, like net's pipe relay), refed for the child's whole
 * lifetime; exec() is one-shot request/response, same shape as
 * createNetRequest. execFileSync() is the one genuinely synchronous member -
 * see syncExecClient.ts/processClient.ts's createSyncExecChannelFor for why
 * it needs its own SharedArrayBuffer bridge rather than reusing spawn/exec's
 * postMessage relay (a response delivered via postMessage to this SAME,
 * Atomics.wait-blocked thread would never be processed - exactly the reason
 * fs.*Sync needed its own Phase 5 bridge instead of reusing the async fs
 * relay). `syncExecChannel` is `null` when this context isn't cross-origin
 * isolated (no SharedArrayBuffer available at all) - matches fs.ts's own
 * `requireSyncChannel` precedent: throw a clear ERR_NOT_ISOLATED rather than
 * silently doing nothing. */
const createChildProcessBridge = (eventLoop: ReturnType<typeof createEventLoop>, syncExecChannel: SyncExecChannel | null) => ({
  spawn: (command: string, args: string[], cwd: string, env: Record<string, string>, handlers: ChildProcessSpawnHandlers): { kill(): void } => {
    const id = crypto.randomUUID();
    eventLoop.ref();
    childSpawnHandlers.set(id, {
      onStdout: handlers.onStdout,
      onStderr: handlers.onStderr,
      onExit: (code, errorMessage) => {
        eventLoop.unref();
        handlers.onExit(code, errorMessage);
      },
    });
    self.postMessage({ type: "cp-spawn", payload: { id, command, args, cwd, env } });
    return {
      kill: () => self.postMessage({ type: "cp-kill", payload: { id } }),
    };
  },
  exec: (line: string, cwd: string): Promise<{ output: string; cwd: string; exitCode: number }> => {
    const id = crypto.randomUUID();
    eventLoop.ref();
    return new Promise((resolve, reject) => {
      pendingChildExecs.set(id, {
        resolve: (v) => {
          eventLoop.unref();
          resolve(v);
        },
        reject: (error) => {
          eventLoop.unref();
          reject(error);
        },
      });
      self.postMessage({ type: "cp-exec", payload: { id, line, cwd } });
    });
  },
  // Combines stdout+stderr into one `output` string, same as exec()/shell
  // exec()'s own already-established buffered contract above (real
  // execFileSync separates them; this runtime's own process-event plumbing
  // doesn't preserve that distinction anywhere yet, and nothing has traced
  // an actual need for it on the synchronous path specifically) - lib/
  // child_process.js's real-Node-shaped execFileSync() is what turns a
  // non-zero exitCode into the thrown, `.status`/`.stdout`-carrying Error
  // real Node's own execFileSync throws.
  execFileSync: (command: string, args: string[], cwd: string, env: Record<string, string>): { exitCode: number; output: string } => {
    if (!syncExecChannel) {
      throw new DWCError(ERR_NOT_ISOLATED, "Synchronous child_process calls require cross-origin isolation (COOP/COEP)");
    }
    const response = callSyncExec(syncExecChannel, { command, args, cwd, env });
    if (!response.ok) {
      throw new Error(response.message);
    }
    return { exitCode: response.exitCode, output: response.output };
  },
});

const handleChildProcessEvent = (payload: {
  id: string;
  kind: "stdout" | "stderr" | "exit" | "error";
  chunk?: Uint8Array;
  code?: number;
  message?: string;
}): void => {
  const handlers = childSpawnHandlers.get(payload.id);
  if (!handlers) return;

  if (payload.kind === "stdout") {
    handlers.onStdout(payload.chunk!);
    return;
  }
  if (payload.kind === "stderr") {
    handlers.onStderr(payload.chunk!);
    return;
  }
  childSpawnHandlers.delete(payload.id);
  handlers.onExit(payload.kind === "error" ? null : payload.code!, payload.kind === "error" ? payload.message : undefined);
};

const handleChildExecResponse = (payload: {
  id: string;
  ok: boolean;
  result?: { output: string; cwd: string; exitCode: number };
  error?: { message: string };
}): void => {
  const waiting = pendingChildExecs.get(payload.id);
  if (!waiting) return;
  pendingChildExecs.delete(payload.id);

  if (payload.ok) waiting.resolve(payload.result!);
  else waiting.reject(new Error(payload.error!.message));
};

const exitProcess = (code: number): void => {
  if (exited) return;
  exited = true;
  postEvent("exit", { code });
};

interface TimerHandle {
  id: number;
  ref(): TimerHandle;
  unref(): TimerHandle;
}

/** Wraps eventLoop.ts's plain numeric timer id into the Node-shaped handle
 * guest code's global setTimeout()/setImmediate() must return - see the
 * Object.assign(self, ...) call site's own comment for why. */
const wrapTimerHandle = (id: number): TimerHandle => ({
  id,
  ref() {
    return this;
  },
  unref() {
    return this;
  },
});

/** clearTimeout()/clearImmediate() accept either the wrapped handle above or
 * a bare numeric id (real Node's own clearTimeout() is equally permissive). */
const unwrapTimerHandle = (handle: unknown): number =>
  typeof handle === "object" && handle !== null ? (handle as TimerHandle).id : (handle as number);

const write = (stream: "stdout" | "stderr", chunk: string | Uint8Array): void => {
  postEvent(stream, { chunk: typeof chunk === "string" ? encoder.encode(chunk) : chunk });
};

/** Minimal process.stdout/stderr — just enough for coreutils-style programs'
 * `process.stdout.write(...)` idiom (real Node's own convention, which every
 * demo/script so far has avoided in favor of console.log). Reference-equality
 * checks against these in vendored lib code (net.js, streams/readable.js)
 * stay correct either way; nothing there calls .write() on them.
 *
 * `write()`'s optional callback matters more than it looks: real npm's own
 * exit-handler.js flushes with `stderr.write('', () => stdout.write('', () =>
 * process.exit(...)))` specifically so it "doesn't hang on things like the
 * update notifier" instead of waiting for the event loop to drain on its
 * own — if that callback is silently dropped, process.exit() is never
 * reached and the guest process hangs forever right after its last output,
 * regardless of anything actually still pending. */
const createWritableStream = (stream: "stdout" | "stderr", nextTick: (callback: () => void) => void) => ({
  write: (chunk: string | Uint8Array, encodingOrCallback?: string | (() => void), callback?: () => void): boolean => {
    write(stream, chunk);
    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (cb) nextTick(cb);
    return true;
  },
  isTTY: false,
});

const createSyncFsChannel = (syncFs: SyncFsChannelPayload | null): SyncFsChannel | null =>
  syncFs ? { port: syncFs.port, control: new Int32Array(syncFs.control), data: syncFs.data } : null;

const createSyncExecChannel = (syncExec: SyncExecChannelPayload | null): SyncExecChannel | null =>
  syncExec ? { port: syncExec.port, control: new Int32Array(syncExec.control), data: syncExec.data } : null;

const createFsBuiltinFromChannel = (
  channel: SyncFsChannel | null,
  nextTick: (callback: () => void) => void,
  wrapBuffer: (bytes: Uint8Array) => Uint8Array,
): FsBuiltin => {
  const io: FsBuiltinIO = {};
  if (channel) io.callSync = (request) => callSyncFs(channel, request);
  return createFsBuiltin(io, nextTick, wrapBuffer);
};

const decoder = new TextDecoder();

/** Backs moduleLoader.ts's `readFileSync` fallback with the same synchronous
 * SharedArrayBuffer bridge guest `fs.*Sync` calls use - see that option's doc
 * comment for why the ahead-of-boot preload can miss a real, on-VFS file.
 * Any failure (ENOENT, EISDIR against a directory candidate, ...) is "not
 * this candidate," not a fatal error - the caller tries the next one. */
const createModuleReadFileSync = (channel: SyncFsChannel | null): ((path: string) => string | null) | undefined => {
  if (!channel) return undefined;
  return (path) => {
    try {
      const response = callSyncFs(channel, { op: FsOp.READ_FILE, path });
      return response.op === FsOp.READ_FILE ? decoder.decode(response.contents) : null;
    } catch {
      return null;
    }
  };
};

const boot = async (payload: BootPayload): Promise<void> => {
  const eventLoop = createEventLoop();

  // Real Node's process.umask() getter/setter affects default file-creation
  // permissions - there's no real host umask to report on, so this is a
  // plausible, fixed stand-in (0o022, the most common Linux default),
  // mutable via the real setter form since that's a cheap, correct addition
  // once the getter exists. Traced need: real npm's own bin-links dependency
  // computes an executable's mode as `0o777 & ~process.umask()`.
  let currentUmask = 0o022;

  const processGlobal: { nextTick: typeof eventLoop.nextTick; env: Record<string, string>; [key: string]: unknown } = {
    argv: ["node", payload.entryPath, ...payload.argv],
    env: payload.env,
    cwd: () => payload.cwd,
    exitCode: 0,
    exit(code = 0) {
      exitCode = code as number;
      exitProcess(exitCode);
    },
    nextTick: eventLoop.nextTick,
    stdout: createWritableStream("stdout", eventLoop.nextTick),
    stderr: createWritableStream("stderr", eventLoop.nextTick),
    title: "node",
    // Matches the pinned version the vendored lib/*.js sources actually come
    // from (see e.g. lib/net.js's own "VENDORED VERBATIM from Node.js
    // v24.18.0" header) - the most honest answer for anything (like npm's own
    // engines check) that compares process.version against what's running.
    version: "v24.18.0",
    // `versions.webcontainer` is a real, publicly-documented convention
    // StackBlitz's own WebContainers uses so a package can feature-detect
    // "I'm running inside a WebContainer-shaped sandbox, not a real OS
    // process" and adapt - traced need: real rolldown's own
    // dist/shared/binding-*.mjs (rolldown-vite's bundler, loaded via a
    // native N-API addon everywhere else) checks exactly
    // `globalThis.process?.versions?.["webcontainer"]` as its own
    // documented, first-party fallback trigger before giving up with
    // "Cannot find native binding" - since this runtime genuinely IS that
    // same shape of sandbox (no real native-binding loading is possible
    // here either), this is an honest, traced signal, not a lie to dodge a
    // check; the value is this project's own version, not a claim to BE
    // StackBlitz's product.
    versions: { node: "24.18.0", webcontainer: "0.0.1" },
    platform: "linux",
    arch: "x64",
    // Real Node code (traced need: @npmcli/config's own loadGlobalPrefix())
    // derives the global install prefix from dirname(dirname(execPath)) -
    // matches NPM_VFS_ROOT (examples/playground/src/vendorNpm.ts) being
    // mounted at /usr/lib/node_modules/npm, so that derivation lands on the
    // same /usr a real global npm install would also compute.
    execPath: "/usr/bin/node",
    umask(mask?: number): number {
      const previous = currentUmask;
      if (mask !== undefined) currentUmask = mask;
      return previous;
    },
    // Real Node's process.report is a whole diagnostic-report subsystem
    // (getReport()/writeReport(), signal-triggered reports, .directory,
    // .filename, ...) - not implemented here beyond the two members real
    // npm's own npm-install-checks actually touches while probing libc
    // family: it toggles `excludeNetwork` around a `getReport()` call, then
    // reads `report.header.glibcVersionRuntime` and `report.sharedObjects`.
    // There's no real glibc/musl to detect from inside a browser sandbox,
    // so an empty header/sharedObjects shape is the honest answer - it
    // makes that probe correctly conclude "family unknown" (null), the same
    // outcome real Node reaches on a platform report can't identify either,
    // rather than fabricating a specific libc.
    report: {
      excludeNetwork: false,
      getReport(): { header: Record<string, never>; sharedObjects: string[] } {
        return { header: {}, sharedObjects: [] };
      },
    },
  };

  // 'net' needs the loop's close phase + liveness ref/unref (see eventLoop.ts's
  // queueClose doc comment and bindings/net.ts's recount()), so the vendored
  // builtins are built ONCE here — not left to moduleLoader's own default
  // construction — and threaded through as options.builtins below. That also
  // means the SAME Buffer class installed as a global (net's `buf()` helper
  // reads it from there) is the one guest code's `require('buffer')` gets too;
  // building two separate instances would make `instanceof Buffer` disagree
  // between them.
  const syncExecChannel = createSyncExecChannel(payload.syncExec);
  const netContext = {
    queueClose: eventLoop.queueClose,
    ref: eventLoop.ref,
    unref: eventLoop.unref,
    netBridge: createNetBridge(eventLoop),
    childProcessBridge: createChildProcessBridge(eventLoop, syncExecChannel),
  };
  // `module.createRequire()`'s returned require() needs moduleLoader's own
  // createRequire - but moduleLoader itself is constructed below FROM
  // vendoredBuiltins (via options.builtins), so there's no instance to
  // reference yet at this point. Filled in right after moduleLoader is
  // created; guest code never actually calls `module.createRequire()` this
  // early (require('module') isn't even reachable until a module body
  // starts running), so the cell is always populated before real use.
  let moduleLoaderCreateRequire: ((fromPath: string) => ((specifier: string) => unknown) & { resolve(specifier: string): string }) | undefined;
  const vendoredBuiltins = createBuiltinModules(processGlobal, netContext, (fromPath) => {
    if (!moduleLoaderCreateRequire) {
      throw new Error("module.createRequire()'s returned require() was called before this process's module loader finished booting");
    }
    return moduleLoaderCreateRequire(fromPath);
  });

  // process.stdin - a real vendored Readable (the same class require('stream')
  // hands guest code, not a hand-rolled stand-in), pushed into from the
  // "stdin" message case in self.onmessage below (see stdinPush's own doc
  // comment). Traced need: real npm's own `read` dependency (used by
  // promzard/npm init's y/n prompts) does
  // `readline.createInterface({ input: process.stdin, ... })` - there was
  // previously no path AT ALL for host-written stdin bytes to reach guest
  // code; dwc.process.spawn()'s `.stdin` WritableStream sent PROCESS_STDIN
  // requests that had no handler anywhere and were silently dropped.
  const { Readable } = vendoredBuiltins.stream as { Readable: new (opts: { read(): void }) => { push(chunk: unknown): boolean } };
  const { Buffer: BufferCtorForStdin } = vendoredBuiltins.buffer as { Buffer: { from(bytes: Uint8Array): unknown } };
  const stdin = new Readable({ read() {} });
  stdinPush = (chunk) => {
    stdin.push(BufferCtorForStdin.from(chunk));
  };
  processGlobal.stdin = stdin;

  // Real Node's process is an EventEmitter (uncaughtException/unhandledRejection
  // listeners, npm's own proc-log wiring via process.emit('log'/'output', ...)) -
  // ours was a plain object until now, which every one of those calls would throw
  // on. Mixed in AFTER building vendoredBuiltins (which only ever needed the
  // narrow {nextTick, env} shape above) so the real vendored EventEmitter class
  // is available; applied to the SAME object every other reference below already
  // points at, not a new one, since Object.assign(self, {process: processGlobal})
  // hasn't run yet.
  const EventEmitter = vendoredBuiltins.events as new () => { emit(event: string, ...args: unknown[]): boolean };
  Object.setPrototypeOf(processGlobal, EventEmitter.prototype);
  EventEmitter.call(processGlobal as unknown as InstanceType<typeof EventEmitter>);

  // The module wrapper (new Function) closes over the global scope, so console/process/
  // timers must be real globals here rather than parameters threaded through requires.
  Object.assign(self, {
    // Real Node's `global` is just an alias for `globalThis` - a Worker has
    // no such identifier at all otherwise, and plenty of real ecosystem code
    // references it directly (traced need: graceful-fs's own source does
    // `global.something`, called from real npm's own entry.js).
    global: self,
    console: {
      log: (...args: unknown[]) => write("stdout", `${args.map(String).join(" ")}\n`),
      info: (...args: unknown[]) => write("stdout", `${args.map(String).join(" ")}\n`),
      // Real Node's console.debug() is a literal alias for console.log(),
      // not a separate stream/behavior - traced need: npm itself calls it
      // somewhere in its own early bootstrap, before config resolution.
      debug: (...args: unknown[]) => write("stdout", `${args.map(String).join(" ")}\n`),
      warn: (...args: unknown[]) => write("stderr", `${args.map(String).join(" ")}\n`),
      error: (...args: unknown[]) => write("stderr", `${args.map(String).join(" ")}\n`),
    },
    process: processGlobal,
    // Real Node's setTimeout()/setImmediate() return a Timeout/Immediate
    // object with .ref()/.unref() (real code calls this - traced need: real
    // npm's own lib/utils/display.js does `this.#timeout = setTimeout(...);
    // this.#timeout.unref()` on its spinner-render timer) - our own
    // eventLoop.ts keeps returning a plain numeric id internally (unchanged,
    // so net/child_process's own direct callers are unaffected), wrapped
    // into a Node-shaped handle only at this guest-facing global boundary.
    // .unref()/.ref() are no-ops (this eventLoop's hasPendingWork() doesn't
    // track per-timer ref state) - the practical effect is a process might
    // wait out an unref'd timer's own delay before concluding it's done,
    // never an actual hang, since the timer still fires normally.
    setTimeout: (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) =>
      wrapTimerHandle(eventLoop.setTimeout(callback, delay, ...args)),
    clearTimeout: (handle: unknown) => eventLoop.clearTimeout(unwrapTimerHandle(handle)),
    setImmediate: (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
      wrapTimerHandle(eventLoop.setImmediate(callback, ...args)),
    clearImmediate: (handle: unknown) => eventLoop.clearImmediate(unwrapTimerHandle(handle)),
    __dwcFetchAsync: createNetRequest(eventLoop),
    Buffer: (vendoredBuiltins.buffer as { Buffer: unknown }).Buffer,
  });

  // netContext is NOT threaded through here: `builtins` below already carries
  // net/dns/tls from the ONE `vendoredBuiltins` built above, and moduleLoader's
  // own default construction (createBuiltinModules(options.process,
  // options.netContext)) would otherwise build a SECOND, independent net
  // binding closure purely to have its output thrown away by the `builtins`
  // override spread — except that closure's `netBridge.onMessage()` call has
  // a live side effect: it steals the kernel's cross-process relay dispatch
  // away from the (correct) instance guest code actually calls require('net')
  // on, so every accepted cross-process connection dispatches into a
  // `pipeServers` map nothing ever populated and gets closed immediately.
  const syncFsChannel = createSyncFsChannel(payload.syncFs);
  const BufferCtor = (vendoredBuiltins.buffer as { Buffer: { from(bytes: Uint8Array): Uint8Array } }).Buffer;
  const fsBuiltin = createFsBuiltinFromChannel(syncFsChannel, eventLoop.nextTick, (bytes) => BufferCtor.from(bytes));
  // Real Node's `fs` module also carries a `.promises` namespace, the same
  // object `require('fs/promises')` returns directly - both point at the
  // one fsBuiltin instance so a `fs.promises.readFile()` and a
  // `require('fs/promises').readFile()` call are calling through the same
  // sync bridge, not two independently-constructed fs bindings.
  const fsPromisesBuiltin = createFsPromisesBuiltin(fsBuiltin, eventLoop.nextTick);
  const moduleLoader = createModuleLoader({
    sources: payload.sources,
    builtins: {
      ...vendoredBuiltins,
      fs: Object.assign(fsBuiltin, { promises: fsPromisesBuiltin }),
      "fs/promises": fsPromisesBuiltin,
    },
    process: processGlobal,
    readFileSync: createModuleReadFileSync(syncFsChannel),
  });
  moduleLoaderCreateRequire = moduleLoader.createRequire;

  // Real Node emits 'uncaughtException' on `process` before its own default
  // reporting - real npm relies on this (its ExitHandler installs a listener
  // that prints its own message and calls process.exit() itself). Emitted
  // unconditionally (a no-op if nothing's listening); the write+exitProcess(1)
  // fallback below still runs either way, but is itself a no-op once a
  // listener has already called exit() (exitProcess() guards on `exited`), so
  // a listener's own exit code always wins over this default.
  //
  // `handlingFatalException` mirrors real Node's own re-entrancy guard around
  // its fatal-exception path: a guest 'uncaughtException' listener that itself
  // throws (real npm's own lib/cli/validate-engines.js does exactly this -
  // its handler re-throws anything that isn't a SyntaxError) must NOT cause a
  // second emit() - emit() isn't wrapped in its own try/catch, so that second
  // throw would escape emit(), escape this function, and (since it's now
  // "uncaught" all over again) come straight back here via the self
  // 'error' listener below, re-entering reportUncaught and re-emitting
  // forever. Once we're already handling one fatal exception, any further
  // error just goes straight to the write+exit fallback with no user
  // listener involved - same as real Node.
  let handlingFatalException = false;
  const reportUncaught = (error: unknown): void => {
    let errorObj = error instanceof Error ? error : new Error(String(error));
    if (!handlingFatalException) {
      handlingFatalException = true;
      try {
        (processGlobal as unknown as { emit(event: string, ...args: unknown[]): boolean }).emit(
          "uncaughtException",
          errorObj,
        );
      } catch (nestedError) {
        errorObj = nestedError instanceof Error ? nestedError : new Error(String(nestedError));
      }
    }
    write("stderr", `${errorObj.stack ?? errorObj.message}\n`);
    exitProcess(1);
  };

  // Guest code can reach a native, untracked async primitive our own eventLoop
  // never sees - a bare `Promise` chain with no `.catch`, or a listener that
  // itself throws while reportUncaught() is already unwinding (see above) -
  // and end up as a genuine top-level worker error that bubbles past this
  // worker entirely (surfacing at the kernel bridge's `onerror`, per the
  // WHATWG nested-worker error-propagation algorithm) - drain()'s catch below
  // only sees errors from work items the eventLoop itself scheduled and
  // awaited. Catching both here and preventDefault()-ing keeps every uncaught
  // error on the same uncaughtException/stderr/exit(1) path regardless of
  // which primitive guest code used to schedule it, and the reentrancy guard
  // above keeps that from looping when the error came from inside
  // reportUncaught's own emit() call.
  self.addEventListener("error", (event) => {
    event.preventDefault();
    reportUncaught(event.error ?? event.message);
  });
  self.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    reportUncaught((event as PromiseRejectionEvent).reason);
  });

  try {
    // A genuinely ESM entry point (see moduleLoader.ts/esmLoader.ts) is
    // evaluated via real, Promise-based native import() - a throw becomes a
    // rejection here rather than a synchronous throw, but the CJS fast path
    // (the overwhelming common case) still throws synchronously exactly as
    // before; either way, `await` catches it the same way.
    await moduleLoader.run(payload.entryPath);
  } catch (error) {
    reportUncaught(error);
    return;
  }

  drain(eventLoop)
    .then(() => exitProcess(exitCode))
    .catch((error: unknown) => {
      // A callback the loop drained (a timer, a nextTick — e.g. the async
      // dns.lookup()->connect() chain) can throw same as top-level code can;
      // uncaught, it would otherwise just reject this promise silently, with
      // nothing to report it and the process never exiting.
      reportUncaught(error);
    });
};

// How many consecutive real macrotask-boundary yields (each guaranteed to
// run only after every currently-queued native microtask has fully drained
// - see eventLoop.ts's yieldToMicrotasks()) drain() gives a guest script's
// own plain `await somePromise()` chain before concluding the process is
// actually done. Needed because such a chain (built entirely on native
// promises - no nextTick/timer/immediate/ref of ours anywhere in it) is
// invisible to hasPendingWork(): real npm's own `which()` -> `isexe()` ->
// `fs.promises.stat()` call chain is exactly this shape, and without this
// grace period the process tore itself down mid-chain, silently dropping
// every write the chain's remaining `await` continuations would have made.
// Each yield is a sub-millisecond MessageChannel round trip, so even the
// full budget adds negligible latency to a process that really is done.
const DRAIN_GRACE_YIELDS = 20;

const drain = async (eventLoop: ReturnType<typeof createEventLoop>): Promise<void> => {
  let idleStreak = 0;
  while (idleStreak <= DRAIN_GRACE_YIELDS) {
    if (eventLoop.hasPendingWork()) {
      idleStreak = 0;
      const didWork = await eventLoop.runOnce();
      if (!didWork) break;
      continue;
    }
    idleStreak++;
    await eventLoop.yieldToMicrotasks();
  }
};

self.onmessage = (event: MessageEvent<{ type: string; payload?: unknown }>) => {
  if (event.data.type === "boot") boot(event.data.payload as BootPayload);
  else if (event.data.type === "net-response") handleNetResponse(event.data.payload as Parameters<typeof handleNetResponse>[0]);
  else if (event.data.type === "net-pipe-connect-response") handlePipeConnectResponse(event.data.payload as { id: string; connId: number });
  else if (event.data.type === "net-pipe-message") pipeMessageHandler?.(event.data.payload as PipeRelayMessage);
  else if (event.data.type === "cp-event") handleChildProcessEvent(event.data.payload as Parameters<typeof handleChildProcessEvent>[0]);
  else if (event.data.type === "cp-exec-response") handleChildExecResponse(event.data.payload as Parameters<typeof handleChildExecResponse>[0]);
  else if (event.data.type === "stdin") stdinPush?.((event.data.payload as { chunk: Uint8Array }).chunk);
};
