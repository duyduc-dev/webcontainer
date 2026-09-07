# Progress notes — real npm install + dev-server preview

Written to hand off work-in-progress across devices. Branch: `feature/new-core`.

## 1. Real `npm install` — DONE, committed

`npm install left-pad` now runs end-to-end against the real npm registry
(real fetch, real gzip decompression, real tar extraction, real sha512
integrity checks) inside the sandbox. Verified live in the browser: correct
files written, correct `package.json`, correct `package-lock.json`.

22 runtime gaps were found and fixed by repeatedly running the real install
and fixing whatever broke next (same iterative method used throughout this
project). Three commits, already on this branch:

- `fe6319b` — process.umask/process.report, util.promisify, path.relative/
  parse/isAbsolute, a large batch of fs callback-form methods
  (readFile/stat/lstat/mkdir/chmod/unlink/rmdir/rename/chown/fchown/utimes/
  futimes/appendFile), the `'wx'` open-flag bug, `rm`'s `force` option,
  readFileSync's default (no-encoding) Buffer-wrapping bug, real SHA-512
  (crypto had no native backend and only did md5/sha1/sha256 — ssri
  defaults every integrity check to sha512, so this was required, not
  optional), `http.STATUS_CODES`, and a from-scratch pure-JS synchronous
  DEFLATE/gzip/zlib decoder (`internal/inflate.js`) wired into
  `Gzip`/`Gunzip`/`Unzip`/`Inflate`/`InflateRaw` — real Node's own zlib
  parsing isn't pure JS (llhttp/native), so this couldn't be vendored the
  way net.js/dns.js/tls.js were.
- (a couple of smaller cleanup/verification commits around the same work)

**One important side-effect bug fixed along the way**, in
`packages/core/src/runtime/eventLoop.ts`: a bare `setTimeout(fn, 500)` with
nothing else pending never fired — `runOnce()` returned `false` the moment
nothing was *immediately* ready, and `worker.ts`'s `drain()` read that
`false` as "nothing left to do at all" and tore the whole process down
before the timer ever became due, even though `hasPendingWork()` correctly
still reported the pending timer. Fixed: `runOnce()` now waits (racing
`waitForWake()` against a real host-clock timeout for however long until
the earliest timer is due) instead of giving up early. This is foundational
— it would have silently broken any real dependency relying on setTimeout
with nothing else keeping the process alive (debounce logic, retry
backoff, connection timeouts — all common in dev-server tooling like Vite).

**A second, related side-effect bug** found in a later session, once
`main.ts` actually exercised a full `npm install left-pad` run through the
normal boot path (not just the ad-hoc fork script from the first pass):
`process.stdout`/`stderr.write()` in `workers/process/worker.ts` accepted an
optional `callback` argument but silently dropped it. Real npm's own
`lib/cli/exit-handler.js` flushes via
`stderr.write('', () => stdout.write('', () => process.exit(...)))`
specifically to avoid hanging on things like the update notifier — with the
callback dropped, `process.exit()` was never reached, and the guest process
hung forever right after its last real output (`npm install` would print
`added 1 package in Ns` and then simply never exit). `--no-audit --no-fund`
does **not** work around this — it's unrelated to which post-install network
calls run. Fixed by threading `eventLoop.nextTick` through
`createWritableStream()`.

## 2. Dev-server preview (StackBlitz/vivari-style) — Phases 1–3 DONE

Goal: run something like `npm run dev` (Vite) inside the sandbox and see it
rendered live in the host page, the way StackBlitz/vivari do. Researched
first (a background fork read the existing net/kernel architecture and
found this exact feature was built once already on the *previous* kernel
architecture, then deleted in the rewrite — old commits `43de44d`/`5989ab7`
(Stage A) and `44ad3d8` (Stage B) are still in git history and were used as
a design reference, not copied verbatim, since the kernel they hooked into
no longer exists).

### Phase 1 — `http.createServer()` — DONE, committed (`e170525`)

Real Node's own HTTP server parsing isn't pure JS either (`_http_server.js`
hands bytes to `llhttp`, a native binding) — so like zlib, this needed a
hand-written parser rather than a vendor. New
`packages/core/src/runtime/node/internal/httpWireFormat.ts` (a plain TS
module, not guest-loadable-factory-wrapped) implements a real, tested
HTTP/1.1 message parser (request/status lines, headers, Content-Length and
chunked body framing) plus request/response serializers.
`internal/http_parser.js` is now a thin guest-loadable wrapper around it.

`runtime/node/lib/http.js` gained real `Server`/`ServerResponse`/
`IncomingMessage` classes on top of the ALREADY-WORKING real vendored `net`
module (same-process loopback AND cross-process, via the kernel's
`netRelay.ts`, both pre-existing). `ServerResponse` buffers the whole
response and decides framing (auto `Content-Length`, always
`Connection: close`) once `.end()` is called — no general chunked-output
writer, since nothing traced needs one yet.

Verified live: a server in one guest process, reachable both from another
script in the *same* process and from a completely *different* process,
over the existing cross-process net relay.

### Phase 2 — `dwc.preview.fetch()` (host page → guest server) — DONE, committed (`db1a0b9`)

The kernel now acts as an HTTP client directly over the existing
cross-process net relay, via a new "virtual client" concept
(`netRelay.registerVirtualClient()`) rather than inventing a second
request/response protocol on top of postMessage — from the server side's
perspective a virtual client is indistinguishable from a different real
Process Worker dialing in, so the already-verified cross-process path
applies unchanged with the kernel standing in for "the other process."

New `workers/kernel/previewRelay.ts` (`fetchFromGuestServer`) formats a
real HTTP/1.1 request (via `httpWireFormat.ts`, imported directly — no
guest wrapper needed since this isn't guest code), sends it over the pipe
relay, and parses the raw response bytes back. New `apis/Preview.ts`
exposes `dwc.preview.fetch(port, path, init)`, rejecting with
`ERR_PREVIEW_CONNECTION_REFUSED` (a new DWCError code) when nothing is
listening.

Verified live: `dwc.preview.fetch(port, path)` from the host page correctly
reached a server running in a spawned guest process and got back a byte-
correct HTTP response (status/headers/body).

### Phase 3 — Service Worker + iframe (the actual visual preview) — DONE

Confirmed working end-to-end: `iframe.src = dwc.preview.url(port, path)`
renders the real guest `http.createServer()` response inside the iframe,
verified via a real (non-`claude-in-chrome`) Playwright-driven Chromium run —
`frame.contentDocument.body.innerHTML` came back with the guest server's
actual HTML.

**Two real, unrelated bugs were found and fixed to get here** (neither of
the two hypotheses guessed at the end of the previous session was quite
right):

1. **A guest-process hang, unrelated to preview** that was silently blocking
   every demo downstream of it (including the preview demo itself, which
   never even got a chance to run). `process.stdout`/`stderr.write()` in
   `workers/process/worker.ts` accepted a `callback` argument but silently
   dropped it. Real npm's own `lib/cli/exit-handler.js` flushes as
   `stderr.write('', () => stdout.write('', () => process.exit(...)))`
   specifically so it "doesn't hang on things like the update notifier"
   instead of relying on the event loop draining naturally — with the
   callback dropped, `process.exit()` was never reached, and the guest
   process hung forever right after its last real output (visible as e.g.
   `npm install` stopping dead right after printing `added 1 package in Ns`,
   with no exit event ever following). Fixed by threading `eventLoop.nextTick`
   through `createWritableStream()` and invoking the callback there.
2. **The actual Phase 3 bug**: `net::ERR_BLOCKED_BY_RESPONSE` on the iframe
   navigation. Root cause: Cross-Origin-Resource-Policy (already set, see
   below) only covers cross-origin *subresources* under COEP — a **framed
   document** is a separate rule. When the embedding page has
   `Cross-Origin-Embedder-Policy: require-corp`, every nested iframe's own
   document response (same-origin or not) must ALSO carry a compatible COEP
   header, or Chromium blocks the navigation outright. Neither hypothesis
   from the previous session (a genuine-but-undocumented async-navigation
   timing bug, or an artifact of the `claude-in-chrome` automation extension)
   was it — the previous session's plain-`fetch()` test never exercised a
   real *navigation* response at all, so it never hit this. Fixed by adding
   `Cross-Origin-Embedder-Policy: require-corp` alongside the existing CORP
   header on every response `PreviewServiceWorker.ts` synthesizes.

`event.waitUntil()` alongside `event.respondWith()` was also added
defensively (candidate (a) from the previous session's list) — harmless,
possibly unnecessary, left in since it's standard practice for async SW
responses.

**Previously-uncommitted files, now confirmed working** (all
typecheck/test clean — `cd packages/core && npx tsc --noEmit -p
tsconfig.json && npx vitest run` is green):

- `packages/core/src/apis/previewProtocol.ts` (new) — tiny shared types
  (`PREVIEW_SCOPE_PREFIX`, `PreviewRelayRequest`/`PreviewRelayResponse`)
  between the page-side API and the Service Worker bundle. Body travels as
  a real `Uint8Array` through structured-clone postMessage, not base64
  (simpler than the old deleted design, which needed base64 because its
  bridge was JSON-only).
- `packages/core/src/workers/preview/PreviewServiceWorker.ts` (new) —
  intercepts fetches under `/__dwc_preview__/<port>/<path>`, tracks port
  per-client so root-absolute asset requests (e.g. `/@vite/client`, which
  arrive with no prefix at all since the browser resolves them against the
  iframe's own document URL) still route correctly, relays through the
  host page via `postMessage`. Ported from the old Stage B design (which is
  browser-API-only, no kernel dependency, so it transplants cleanly).
- `packages/core/src/apis/Preview.ts` (modified) — added `.url(port, path)`
  and `.enable({swUrl, scope})`, which registers the SW (idempotent) and
  wires `navigator.serviceWorker` message events into `dwc.preview.fetch()`.
- `packages/core/tsup.config.ts` (modified) — added a build entry for the
  SW as its own standalone bundle (`workers/preview/PreviewServiceWorker`).
- `packages/core/package.json` (modified) — added a `"./preview-sw"`
  export pointing at the built SW file (a Service Worker script must be
  registered from a plain same-origin URL, not a module specifier).
- `examples/playground/index.html` (modified) — added a
  `<iframe id="preview">`.
- `examples/playground/package.json` (modified) — wired the *already-
  existing* (leftover from before the rewrite, never deleted)
  `scripts/copy-preview-sw.mjs` into `predev`/`prebuild`, alongside the
  existing `vendor-npm.mjs` step. `examples/playground/vite.config.ts`
  ALREADY had the `Service-Worker-Allowed` header middleware from before
  the rewrite too — nothing needed there.
- `examples/playground/public/dwc-preview-sw.js` — generated by the copy
  script, gitignored, not something to commit (already covered by
  `.gitignore`'s existing `examples/playground/public` entry).

**What's verified working:**

- The full relay pipeline (SW → host page → kernel → guest `http.Server`)
  is 100% correct: both a plain `fetch("/__dwc_preview__/<port>/")` call
  from the host page AND a real `<iframe>` navigation return the exact
  right status/headers/body from the real guest server.
- The Service Worker registers correctly, activates, claims clients, and
  the `Service-Worker-Allowed`/`Cross-Origin-Resource-Policy: cross-origin`/
  `Cross-Origin-Embedder-Policy: require-corp` headers are present and
  correct on its responses (see the two bugs above for why both COEP-related
  headers are required).
- `iframe.src = dwc.preview.url(port, path)` renders correctly:
  `frame.contentDocument.body.innerHTML` reflects the real guest server's
  HTML, verified via Playwright.

The three hand-written test Service Workers used mid-session to isolate the
earlier (now-understood-to-be-a-red-herring) sync-vs-async/iframe-vs-top-level
distinction were temporary and already deleted — the real fix ended up being
unrelated to sync/async timing entirely.

## Next plan

Ordered by dependency. Each step should be verified live (typecheck → unit
tests → build → real browser check) before moving to the next, matching
the method used throughout this project so far — don't batch multiple
unverified steps together.

1. ~~Resolve the Phase 3 iframe bug~~ — **DONE.** See above: it was two
   unrelated bugs (a `process.stdout`/`stderr.write()` callback drop hanging
   every guest process after its last output, and a missing
   `Cross-Origin-Embedder-Policy` header on framed-document responses under
   COEP), neither of which was either hypothesis this doc previously listed.

2. ~~Commit Phase 3, update `main.ts` with a real demo~~ — **DONE.**
   `examples/playground/src/main.ts` now spawns a guest `http.createServer()`,
   calls `dwc.preview.enable()`, and points `<iframe id="preview">` at it,
   verified rendering the real server's HTML.

3. **Vite dev server, real end-to-end — IN PROGRESS.** `npm install vite`
   (real registry, real dependency resolution, real tarball extraction) now
   runs to completion: `added 13 packages in 1m`, exit 0. Three real runtime
   bugs were found and fixed getting there, all via the same iterative
   "run it, find the next break, fix it" method as Phase 1's original 22
   gaps — none were guessable in advance, all were confirmed with a direct,
   isolated repro before fixing (concurrent Playwright runs, not the
   `claude-in-chrome` extension — see the Phase 3 postmortem above for why
   that distinction matters):

   - **Sync fs bridge 1MB frame cap.** The SharedArrayBuffer sync fs
     channel (`kernel/fs/syncWireFormat.ts`) has a fixed 1MB data buffer;
     `WRITE_FILE`/`READ_FILE` encoded a file's full contents into it
     unbounded. Any file over ~1MB threw `RangeError: offset is out of
     bounds` on write (and would have corrupted/crashed on read). Real npm
     registry metadata for a popular package (even npm's own
     `--install-v1` abbreviated "corgi" format) routinely exceeds 1MB - this
     wasn't a rare edge case, it broke real `npm install vite`
     deterministically, surfacing as a confusing cacache
     `EEXIST`/`ENOENT` combo (the tmp file's write silently threw before
     ever reaching the kernel, so a later move/rename legitimately found it
     missing). Fixed with real chunking - `WRITE_FILE` gained a `more` flag,
     `READ_FILE` gained a `more` flag plus a new `READ_CHUNK` op - both
     fully transparent to callers of `readFileSync`/`writeFileSync`.
   - **`fs.read()`'s callback dropped its `buffer` argument.** Real Node's
     `fs.read(fd, buffer, offset, length, position, callback)` calls back
     with `(err, bytesRead, buffer)` - ours only passed `(err, bytesRead)`.
     `fs-minipass`'s `ReadStream` (real `tar`'s own dependency) destructures
     all three positionally and does `buf.length` unconditionally, crashing
     with "Cannot read properties of undefined (reading 'length')" deep
     inside unmodified npm code - deterministically, for whichever package
     happened to need a cache read-back via the streaming path (`postcss`,
     `picomatch` in this session) rather than only ever being freshly
     written.
   - **`fs.promises.open()` didn't exist.** `bin-links`' `fix-bin.js` does
     `const { open } = require('fs/promises')` to sniff a freshly-linked
     bin script for a Windows-style hashbang line - crashed every install
     of any package with a bin entry ("open is not a function"). Added a
     minimal `FileHandle` (`read`/`write`/`close`) built on the existing
     `openSync`/`readSync`/`writeSync`/`closeSync` - only the methods real
     npm's own dependency tree actually calls, not the full
     `fs.promises.FileHandle` surface.

   **The ESM blocker — DONE.** Running the installed
   `node_modules/vite/bin/vite.js` used to fail immediately with `Error:
   Cannot use import statement outside a module` - real Vite ships as
   **ESM** (`import`/`export` at the top level), and this project's module
   loader was CommonJS-only. Real ESM semantics (not a transpile shim) were
   deliberately chosen - see the plan this shipped under
   (`.claude/plans/quirky-dazzling-umbrella.md` at the time, since
   archived) for the full design discussion, including consulting a peer
   session on the reference architecture (vivari) about how it solved the
   same problem (it went transpile-to-CJS, for the same
   synchronous-require-via-Atomics.wait reason this project has - several
   of its concrete lessons were folded in anyway, see below).

   New `runtime/esmLoader.ts`: a file positively identified as ESM ahead of
   time (`.mjs` extension, or the nearest `package.json` has `"type":
   "module"`) is evaluated via the browser's/Node's own real, native
   `import()` - each module is built as a `data:text/javascript;base64,...`
   URL with its import specifiers rewritten to point at its dependencies'
   own data: URLs; the engine does the real parsing/linking/evaluation
   (true live bindings, real `import.meta`, real top-level await), not a
   hand-rolled approximation. `data:` (not `blob:`) specifically because
   `blob:` URLs are browser-only - Node's own loader rejects the scheme,
   so `data:` URLs keep this fully unit-testable under vitest's plain
   `node` environment.

   A specifier that resolves to a CJS/builtin target is routed through the
   *existing* `require()` machinery instead, wrapped as a small synthesized
   ESM shim built from the REAL, already-evaluated exports object (this is
   an interpreter, not a bundler - the actual result is already known once
   required, no static guessing needed). A genuine ESM import *cycle* can't
   be represented as a pure data: URL (the URL IS a hash of the fully-
   resolved content - no way to forward-reference not-yet-finalized
   content the way a real engine's parse-then-link-then-evaluate algorithm
   can) - the back-edge that completes a cycle falls back to the same
   CJS-shim mechanism, exactly mirroring how this loader's existing
   circular-CJS-require handling already works elsewhere. `require()` of a
   genuine ESM-only target (the opposite direction) is unchanged - still
   the existing best-effort `transformEsmToCjs` retry from before this
   work, since `require()` must stay synchronous.

   `worker.ts`'s `boot()` became `async` to support this (a shallow
   change - it already fire-and-forgot `moduleLoader.run()`'s result, so
   nothing above it needed to change); the CJS fast path is otherwise
   completely unchanged and un-slowed.

   Four real bugs found and fixed building this (three genuine, one a
   pre-existing latent bug newly exposed):
   - A root-path-joining bug (`` `${dir}/package.json` `` produces
     `"//package.json"` when `dir === "/"`, never matching the real
     `"/package.json"` key) broke ESM detection for any root-level file -
     present in *two* places, including a pre-existing latent copy in
     `moduleLoader.ts`'s `findPackageRoot` (used for `#imports` resolution)
     that had simply never been exercised with a root-level `package.json`
     before.
   - The specifier-rewrite matcher's "is this real code, not text sitting
     inside an unrelated string/comment?" check compared the ENTIRE regex
     match (including the quoted specifier itself) against the masked
     text - but the quoted specifier is *always* blanked by masking (that's
     what makes it a string literal), so every legitimate import was a
     guaranteed false negative. Fixed to check only the match's first
     (keyword) character.
   - The CJS-interop shim generator checked `typeof exported === "object"`
     to decide whether to enumerate named exports - excluding the common
     real shape `module.exports = someFunction` with extra properties
     attached (real npm's own `left-pad`, among many others), silently
     dropping every named export from a function-shaped CJS module.
   - An `"exports"` map value of `null` (real Node's way of explicitly
     hiding an internal subpath) returned `null` from the resolver, which
     the caller treated identically to "not found here, fall through to
     the lenient old CJS resolver" - letting a deliberately-hidden file
     leak through via the fallback path instead of being blocked. Fixed to
     throw (matching real Node's `ERR_PACKAGE_PATH_NOT_EXPORTED`) instead
     of silently falling through.
   - (Unrelated to ESM, found by the same end-to-end verification run:
     `console.debug` was never implemented as a guest builtin at all - real
     npm's own early bootstrap calls it before config resolution even
     starts, on a code path this session's testing hadn't hit until now.
     Real Node's `console.debug` is a literal alias for `console.log`;
     fixed the same way.)

   **Verified end-to-end**: real `npm install vite` (exit 0) followed by
   spawning the real, installed `node_modules/vite/bin/vite.js` directly -
   the `Cannot use import statement` error is completely gone; the entry
   point's own top-level `import`s (`node:perf_hooks`, `node:module`, ...)
   resolve and execute. It now fails on `Cannot find module 'perf_hooks'` -
   a missing Node builtin, an entirely different and expected class of gap
   (not an ESM problem at all - `perf_hooks` was simply never in
   `createBuiltinModules()`'s registry, unrelated to this work).

   **Next, still expected** (not yet reached - this is what "run it, find
   the next break" surfaces from here): missing Node builtins Vite's own
   entry point and dependency tree reach for (`perf_hooks` confirmed
   missing already; `module`, possibly `worker_threads`, others likely),
   file-watching (`fs.watch`/chokidar - not implemented at all yet), and
   real static-asset serving through `http.ServerResponse` (streaming large
   files - Phase 1's whole-response-buffering simplification may need
   revisiting if a real Vite bundle turns out too large to buffer
   comfortably).

4. **HMR (hot module reload) — a real, unresolved design question, not
   just an implementation gap.** Vite's dev server pushes HMR updates over
   a `ws://` WebSocket the client page opens back to the dev server.
   Nothing in this stack implements WebSocket upgrade handling, and a
   Service Worker's `fetch` event **cannot** intercept a WebSocket
   handshake at all (`fetch` events don't fire for them) — the current
   architecture has no path for this. Options, in rough order of effort:
   skip HMR for a first version (Vite still works as a plain dev server
   without live reload, just without the live-reload part); implement a
   minimal in-VM WebSocket server (real Node `ws` upgrade handling is,
   like HTTP, not pure JS — another hand-written-parser-scale effort) plus
   a browser-side relay for the upgrade handshake specifically; or some
   other bridge not yet designed. Don't assume this is easy — flag it and
   decide deliberately before starting, the same way the zlib-vs-vendor
   and pure-JS-inflate decisions were surfaced explicitly earlier in this
   project rather than silently picked.

5. **Playground demo replaced with a real React app** (not yet reflected
   above since it landed after the ESM work's own PROGRESS.md entry).
   `examples/playground/src/main.ts` now does a real `npm install react@18
   react-dom@18` (pinned to 18, not `@latest`/19.x - React 19's
   `react-dom/server` pulls in `node:async_hooks`'s `AsyncLocalStorage`,
   which needs real V8 async-context propagation this runtime deliberately
   doesn't fake), then a real guest `http.createServer()` that `require()`s
   the actual installed React and server-renders a page with it on every
   request, previewed live through the Service Worker relay. No bundler/
   dev-server involved - deliberately takes the path that's fully working
   today rather than the still-blocked Vite dev-server path. Found and
   fixed one more real gap along the way: `util.TextEncoder`/`TextDecoder`
   were missing (real Node re-exports the same globals from `require('util')`
   for backward compat; `react-dom/server`'s own bundled output relies on
   this).

6. **`npm create`/`npm init` — `vm` fixed, `readline` is next.** Real npm's
   own `promzard` dependency (used by `npm init`/`npm create` to evaluate a
   project's init-defaults script) does
   `const { runInThisContext } = require('vm')`, which crashed immediately
   with "Cannot find module 'vm'". Added a real `vm.runInThisContext()`
   (`runtime/builtins/vm.ts`) - scoped to exactly this one traced need, not
   the full `vm` module: real Node's `vm` is backed by native V8
   Context/Script bindings for true isolated-global-object sandboxing,
   which can't be replicated in userland JS at all, but `runInThisContext`
   specifically doesn't need that - real Node's own semantics for it are
   "shares the caller's real global scope, not an isolated sandbox" (that's
   what `runInNewContext`/`createContext` are for), which indirect `eval`
   already provides correctly, not merely approximately.
   `runInNewContext`/`createContext`/the `Script` class are deliberately
   left unimplemented rather than faking isolation, matching the
   `AsyncLocalStorage` precedent above.

   Verified: `npm create vite@latest` no longer fails on the missing `vm`
   module and gets measurably further into npm's init flow. It now hits a
   **different, new** gap: `Cannot find module 'readline'`, from the `read`
   package (npm's own interactive-prompt dependency, pulled in even with
   `-- --template vanilla` supplied to skip create-vite's own prompts - npm
   init's own flow still reaches for it somewhere upstream of that). Not
   yet investigated - the next "run it, find the next break" candidate for
   whoever picks this up, separate from the Vite-dev-server gaps in item 3.

## Reminder: no AI attribution in commits

Per standing preference, commit messages for this project should not
include `Co-Authored-By`/session-link footers.
