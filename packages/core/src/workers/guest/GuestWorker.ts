import { resolutionKey } from "../../kernel/modules/preload";

type BootMessage = {
  type: "boot";
  entryPath: string;
  sources: [string, string][];
  resolutions: [string, string][];
  argv: string[];
  env: Record<string, string>;
  cwd: string;
};

type ModuleRecord = { exports: unknown };

const moduleCache = new Map<string, ModuleRecord>();
let sources: Map<string, string>;
let resolutions: Map<string, string>;

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

self.onmessage = (event: MessageEvent<BootMessage>) => {
  const message = event.data;
  if (message.type !== "boot") return;

  sources = new Map(message.sources);
  resolutions = new Map(message.resolutions);
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

  self.postMessage({ type: "exit", exitCode });
  self.close();
};
