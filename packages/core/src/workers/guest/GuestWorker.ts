import { resolutionKey } from "../../kernel/modules/preload";
import { resolveModule } from "../../kernel/modules/resolve";
import { FsReaderWithReaddir } from "../../kernel/fs/FsReader";
import { loadPureBuiltin } from "./builtins";
import { Buffer } from "./builtins/buffer";
import { createFsModule } from "./builtins/fs";
import { createHttpModule, HttpRequestListener } from "./builtins/http";
import { createStaticFsClient } from "./fsClients/staticFsClient";
import { createSyncFsClient } from "./fsClients/syncFsClient";

type StaticBootMessage = {
  type: "boot";
  transport: "static";
  entryPath: string;
  sources: [string, string][];
  resolutions: [string, string][];
  fsFiles: [string, string][];
  argv: string[];
  env: Record<string, string>;
  cwd: string;
};

type SyncBootMessage = {
  type: "boot";
  transport: "sync";
  entryPath: string;
  sab: SharedArrayBuffer;
  argv: string[];
  env: Record<string, string>;
  cwd: string;
};

// Exported so nodeCommand.ts (kernel-worker side) can type the boot message
// it sends against the exact same union this worker expects to receive.
export type BootMessage = StaticBootMessage | SyncBootMessage;

type HttpRequestMessage = {
  type: "http-request";
  requestId: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
};

type IncomingMessage = BootMessage | HttpRequestMessage;

type ModuleRecord = { exports: unknown };

const moduleCache = new Map<string, ModuleRecord>();
let transport: "static" | "sync";
let fsReader: FsReaderWithReaddir;
let fsModule: unknown;
let httpModule: unknown;
let activeHandler: HttpRequestListener | undefined;

// Static-transport-only: the whole require() graph pre-resolved/pre-read
// ahead of boot by preload.ts's regex scan.
let staticSources: Map<string, string>;
let staticResolutions: Map<string, string>;

// Sync-transport-only: each require() resolution is a live round trip over
// the SharedArrayBuffer bridge, so cache (fromPath, specifier) -> resolved
// path the same way preload.ts's ahead-of-time scan would have — just
// populated lazily instead of eagerly.
const syncResolutionCache = new Map<string, string>();

function postData(stream: "stdout" | "stderr", chunk: string) {
  self.postMessage({ type: "data", stream, chunk });
}

function formatArgs(args: unknown[]): string {
  return args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
}

console.log = (...args: unknown[]) => postData("stdout", `${formatArgs(args)}\n`);
console.error = (...args: unknown[]) => postData("stderr", `${formatArgs(args)}\n`);
console.warn = (...args: unknown[]) => postData("stderr", `${formatArgs(args)}\n`);

function dirnameOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

function resolveSync(fromPath: string, specifier: string): string {
  const key = resolutionKey(fromPath, specifier);
  const cached = syncResolutionCache.get(key);
  if (cached) return cached;
  const resolved = resolveModule(fsReader, dirnameOf(fromPath), specifier);
  syncResolutionCache.set(key, resolved);
  return resolved;
}

function createRequire(fromPath: string) {
  return function guestRequire(specifier: string): unknown {
    // Node builtins always win over node_modules, even if a package shadows
    // the name — checked before either transport's resolution below.
    if (specifier === "fs") return fsModule;
    if (specifier === "http") return httpModule;
    const pureBuiltin = loadPureBuiltin(specifier);
    if (pureBuiltin !== undefined) return pureBuiltin;

    if (transport === "static") {
      const resolved = staticResolutions.get(resolutionKey(fromPath, specifier));
      if (!resolved) throw new Error(`Cannot find module '${specifier}'`);
      return loadModule(resolved);
    }

    return loadModule(resolveSync(fromPath, specifier));
  };
}

function readSyncSource(path: string): string | undefined {
  try {
    return new TextDecoder().decode(fsReader.readFile(path));
  } catch {
    return undefined;
  }
}

function loadModule(path: string): unknown {
  const cached = moduleCache.get(path);
  if (cached) return cached.exports;

  const source = transport === "static" ? staticSources.get(path) : readSyncSource(path);
  if (source === undefined) {
    throw new Error(`Cannot find module source for '${path}'`);
  }

  if (path.endsWith(".json")) {
    const parsed = JSON.parse(source);
    moduleCache.set(path, { exports: parsed });
    return parsed;
  }

  const record: ModuleRecord = { exports: {} };
  moduleCache.set(path, record);

  const wrapper = new Function("exports", "require", "module", "__filename", "__dirname", source);
  wrapper(record.exports, createRequire(path), record, path, dirnameOf(path));

  return record.exports;
}

function handleHttpRequest(message: HttpRequestMessage) {
  if (!activeHandler) {
    self.postMessage({
      type: "http-response",
      requestId: message.requestId,
      status: 502,
      headers: {},
      body: "no active server in this process",
      bodyEncoding: "utf8",
    });
    return;
  }

  const req = { method: message.method, url: message.path, headers: message.headers };
  const chunks: string[] = [];
  let responded = false;

  const respond = () => {
    if (responded) return;
    responded = true;
    self.postMessage({
      type: "http-response",
      requestId: message.requestId,
      status: res.statusCode,
      headers: res.headers,
      body: chunks.join(""),
      bodyEncoding: "utf8",
    });
  };

  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    writeHead(status: number, headers?: Record<string, string>) {
      res.statusCode = status;
      if (headers) Object.assign(res.headers, headers);
    },
    write(chunk: unknown) {
      chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) res.write(chunk);
      respond();
    },
  };

  try {
    activeHandler(req, res);
  } catch (error) {
    postData("stderr", `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    if (!responded) {
      responded = true;
      self.postMessage({
        type: "http-response",
        requestId: message.requestId,
        status: 500,
        headers: {},
        body: "internal error",
        bodyEncoding: "utf8",
      });
    }
  }
}

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;

  if (message.type === "http-request") {
    handleHttpRequest(message);
    return;
  }

  if (message.type !== "boot") return;

  transport = message.transport;
  if (message.transport === "static") {
    staticSources = new Map(message.sources);
    staticResolutions = new Map(message.resolutions);
    fsReader = createStaticFsClient(new Map(message.fsFiles));
  } else {
    fsReader = createSyncFsClient(message.sab);
  }

  fsModule = createFsModule(fsReader);
  httpModule = createHttpModule((port, handler) => {
    activeHandler = handler;
    self.postMessage({ type: "listen", port });
  });
  (self as unknown as { process: unknown }).process = {
    argv: ["node", message.entryPath, ...message.argv],
    env: message.env,
    cwd: () => message.cwd,
  };
  // Real Node exposes Buffer as a global, not just via require("buffer") —
  // an enormous fraction of npm packages reference it unqualified.
  (self as unknown as { Buffer: unknown }).Buffer = Buffer;

  let exitCode = 0;
  try {
    loadModule(message.entryPath);
  } catch (error) {
    postData("stderr", `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    exitCode = 1;
  }

  // setTimeout (a macrotask), not a synchronous close: lets any already-
  // resolved promises' .then() chains — e.g. util.promisify wrapping a
  // synchronously-invoked callback — finish before the worker exits. Doesn't
  // wait for genuinely delayed work (real timers, real async I/O) started at
  // the top level; that needs full event-loop-drain tracking, out of scope.
  // If the script started an http server, the process stays alive
  // indefinitely instead — matches a real foreground server blocking a shell.
  setTimeout(() => {
    if (activeHandler) return;
    self.postMessage({ type: "exit", exitCode });
    self.close();
  }, 0);
};
