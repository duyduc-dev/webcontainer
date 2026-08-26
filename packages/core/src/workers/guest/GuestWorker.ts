import { resolutionKey } from "../../kernel/modules/preload";
import { loadPureBuiltin } from "./builtins";
import { createFsModule } from "./builtins/fs";
import { createHttpModule, HttpRequestListener } from "./builtins/http";

type BootMessage = {
  type: "boot";
  entryPath: string;
  sources: [string, string][];
  resolutions: [string, string][];
  fsFiles: [string, string][];
  argv: string[];
  env: Record<string, string>;
  cwd: string;
};

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
let sources: Map<string, string>;
let resolutions: Map<string, string>;
let fsModule: unknown;
let httpModule: unknown;
let activeHandler: HttpRequestListener | undefined;

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

function createRequire(fromPath: string) {
  return function guestRequire(specifier: string): unknown {
    // Node builtins always win over node_modules, even if a package shadows
    // the name — checked before the preloaded-graph lookup below.
    if (specifier === "fs") return fsModule;
    if (specifier === "http") return httpModule;
    const pureBuiltin = loadPureBuiltin(specifier);
    if (pureBuiltin !== undefined) return pureBuiltin;

    const resolved = resolutions.get(resolutionKey(fromPath, specifier));
    if (!resolved) {
      throw new Error(`Cannot find module '${specifier}'`);
    }
    return loadModule(resolved);
  };
}

function loadModule(path: string): unknown {
  const cached = moduleCache.get(path);
  if (cached) return cached.exports;

  const source = sources.get(path);
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

  sources = new Map(message.sources);
  resolutions = new Map(message.resolutions);
  fsModule = createFsModule(new Map(message.fsFiles));
  httpModule = createHttpModule((port, handler) => {
    activeHandler = handler;
    self.postMessage({ type: "listen", port });
  });
  (self as unknown as { process: unknown }).process = {
    argv: ["node", message.entryPath, ...message.argv],
    env: message.env,
    cwd: () => message.cwd,
  };

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
