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

3. **Vite dev server, real end-to-end.** This is where new, currently-
   unknown gaps will surface, the same way `npm install` did — budget for
   an iterative "run it, find the next break, fix it" loop, not a single
   pass. Concretely: `npm install vite` (now unblocked by Phase 1's real
   npm install work) into a sandboxed project, run `vite` (or
   `node_modules/.bin/vite`) as a guest process, and see how far it gets
   starting a dev server on top of the real `http`/`net` now in place.
   Expect gaps in areas Vite specifically touches that npm's own install
   flow never exercised: file-watching (`fs.watch`/chokidar — not
   implemented at all yet, as far as this session got), possibly
   `worker_threads` or other unimplemented builtins Vite's dependency tree
   might reach for, and real static-asset serving through
   `http.ServerResponse` (streaming large files — Phase 1's
   whole-response-buffering simplification may need revisiting if a real
   Vite bundle turns out too large to buffer comfortably).

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

## Reminder: no AI attribution in commits

Per standing preference, commit messages for this project should not
include `Co-Authored-By`/session-link footers.
