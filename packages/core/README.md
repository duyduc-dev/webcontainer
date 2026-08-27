# @dwc/core

A WebContainer-style sandbox that runs in the browser: a virtual filesystem, a
shell, `node`/`npm` execution, and live preview of servers started inside it —
all in a Web Worker, no backend required.

## Install

```bash
npm install @dwc/core
```

## Quick start

```ts
import { DuckWebContainer } from "@dwc/core";

const dwc = DuckWebContainer.initialize();

await dwc.fs.mkdir("/project", { recursive: true });
await dwc.fs.writeFile("/project/hello.txt", "hello world");
await dwc.fs.readFile("/project/hello.txt", "utf8"); // "hello world"

await dwc.shell.exec("cd /project");
const result = await dwc.shell.exec("pwd"); // { stdout: "/project", stderr: "", exitCode: 0, cwd: "/project" }
```

## Filesystem — `dwc.fs`

`mkdir(path, { recursive? })`, `writeFile(path, data)`, `readFile(path, "utf8" | undefined)`,
`readdir(path)`, `stat(path)`, `rm(path, { recursive? })`, `rename(from, to)`.

All calls are promise-based and throw `FSError` (with `.code` — `ENOENT`,
`EEXIST`, `ENOTDIR`, `EISDIR`, `ENOTEMPTY`, `EINVAL` — and `.path`) on failure.

## Shell — `dwc.shell`

```ts
const result = await dwc.shell.exec("mkdir -p /project && cd /project");
```

- `exec(line)` runs to completion and resolves with `{ stdout, stderr, exitCode, cwd }`.
  Supports `&&` chaining (stops on the first non-zero exit code) and `>`/`>>`
  redirection.
- `spawn(line)` starts a process without waiting for it to exit and resolves
  immediately with a `Process` (`.onData((stream, chunk) => ...)`,
  `.onExit((exitCode, cwd) => ...)`). Use this instead of `exec` for anything
  long-running, like a server started with `node` — `exec` would otherwise
  never resolve.

Built-in commands: `pwd`, `cd`, `ls`, `cat`, `mkdir [-p]`, `touch`, `echo`,
`rm [-r]`, `mv`, `kill <port>`.

`node <script>` runs a script in its own guest Worker. Inside guest scripts,
`require()` resolves Node's `path`, `events`, `util`, `fs`, and a minimal
`http` (`http.createServer(...).listen(port, cb)` — see [Preview](#preview)
below), plus anything installed via `npm install`/`npm install <pkg>`, which
resolves real packages from `registry.npmjs.org` (semver ranges included) into
`node_modules` on the virtual filesystem.

## Preview

A guest `node` process that calls `server.listen(port)` doesn't open a real
TCP socket — the kernel just remembers which guest Worker owns that port and
emits a `listen` event:

```ts
dwc.on("listen", ({ port }) => {
  console.log(`server listening on ${port}`);
});
```

From there you have two ways to actually talk to it:

### Direct fetch

```ts
const res = await dwc.preview.fetch(port, "/", { method: "GET" });
// { status, headers, body, bodyEncoding: "utf8" | "base64" }
```

Good for polling/testing that a server inside the container is responding.
Bodies are fully buffered (no streaming) and, currently, always `utf8` — the
guest `http` shim doesn't produce binary/base64 responses yet, so serving
binary assets (images, fonts, wasm) through preview isn't supported.

### Live `<iframe>` preview

```ts
await dwc.preview.enable({ swUrl: "/dwc-preview-sw.js" });
iframe.src = dwc.preview.url(port); // "/__dwc_preview__/<port>/"
```

This registers a Service Worker that intercepts the iframe's traffic —
including a real dev server's root-absolute asset requests (`/style.css`,
`/@vite/client`, etc., which arrive with no prefix at all) — and relays it
through `dwc.preview.fetch()` under the hood.

Two things this requires that can't be automated by the library:

1. **You must serve the Service Worker script yourself**, at (or above) the
   scope you pass to `enable()`. `navigator.serviceWorker.register()` only
   accepts a same-origin URL — there's no bundler magic (unlike the
   `new Worker(new URL(...))` calls this package uses internally) that can
   make a `node_modules` file reachable at a stable public URL for this.
   Resolve the built file via the `@dwc/core/preview-sw` export and copy it
   into wherever your app serves static assets from its origin root (see
   `examples/playground/scripts/copy-preview-sw.mjs` for a working example
   with Vite).
2. **If it isn't served from the actual origin root**, the response needs a
   `Service-Worker-Allowed: /` header, or the browser caps the Service
   Worker's max scope to the script's own directory and preview requests
   outside that directory silently stop being intercepted.

**No real origin isolation.** Preview content runs on your app's own origin,
so it isn't isolated from your host page's cookies/storage the way a real
sandboxed subdomain would be. Wrapping the iframe in
`sandbox="allow-scripts"` without `allow-same-origin` doesn't help either —
that gives the iframe an opaque origin, and an opaque origin can't be
controlled by a same-origin Service Worker at all, so preview would just stop
working. If you need genuine isolation, that requires owning a domain with
wildcard DNS and an edge worker to serve each preview from its own origin —
out of scope for a client-only library like this one.

## Events

`dwc.on(type, handler)` / `dwc.off(type, handler)`. Currently emits:

- `"listen"` — `{ port }`, when a guest process starts listening on a port.

## Known limitations

- Guest `http` responses are fully buffered and text-only (no streaming, no
  binary bodies).
- `dwc.preview.enable()` assumes a single top-level host page relaying for a
  single `DuckWebContainer` instance.
- `npm install` fetches directly from `registry.npmjs.org` over the network —
  no offline mode or local cache.
