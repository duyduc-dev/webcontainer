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

## 2. Dev-server preview (StackBlitz/vivari-style) — Phases 1–2 DONE, Phase 3 IN PROGRESS with one open bug

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

### Phase 3 — Service Worker + iframe (the actual visual preview) — IN PROGRESS, NOT YET WORKING, NOT COMMITTED

**Uncommitted files right now** (all present in the working tree, all
typecheck/test clean — `cd packages/core && npx tsc --noEmit -p
tsconfig.json && npx vitest run` was green on the last check):

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
  is 100% correct: a plain `fetch("/__dwc_preview__/<port>/")` call from
  the host page (not iframe navigation, just a normal fetch that the SW
  also intercepts) returns the exact right status/headers/body from the
  real guest server, every time, verified repeatedly with fresh servers.
- The Service Worker registers correctly, activates, claims clients, and
  the `Service-Worker-Allowed`/`Cross-Origin-Resource-Policy: cross-origin`
  headers are present and correct on its responses (the latter is required
  because this playground's page has `Cross-Origin-Embedder-Policy:
  require-corp` set for `SharedArrayBuffer`, and Chrome enforces COEP on
  every nested browsing context it embeds — even a same-origin iframe needs
  a permissive CORP header on its own response, or the embed is silently
  blocked. This was one real, non-obvious bug already found and fixed in
  `PreviewServiceWorker.ts`.)

**What's NOT working yet — the open bug:**

Setting `iframe.src = dwc.preview.url(port, path)` does not render. The
iframe shows a broken/failed-to-load state; `frame.contentDocument` stays
inaccessible. This is despite the underlying response being byte-correct
(proven via the plain `fetch()` test above, and via the CORP header fix).

**Debugging done so far, and the key finding:** isolated the exact
condition with a series of minimal, hand-written test Service Workers
(created temporarily under `examples/playground/public/test-*.js`, since
deleted — not part of the diff):

1. A SW that returns a **synchronous** `new Response(...)` for an iframe
   navigation: **works**, iframe renders fine, `contentDocument` accessible.
2. The exact same SW, but with `event.respondWith((async () => { await new
   Promise(r => setTimeout(r, 50)); return new Response(...) })())` — i.e.
   the *only* change is adding a 50ms delay before resolving: **breaks**,
   same broken-iframe symptom as the real PreviewServiceWorker.
3. The same 50ms-delayed SW response, but as a **top-level** navigation
   (`navigate(tabId, ".../async-test/")` instead of an iframe): **works
   fine**, renders correctly, no delay-related problem at all.

So the reproducible rule in this testing setup is: **an asynchronously-
resolved Service Worker response to a *sub-frame* (iframe) navigation
fails to render, while the identical response resolved synchronously, or
resolved asynchronously for a *top-level* navigation, both work fine.**

This was being investigated when work stopped. Two live hypotheses, neither confirmed:

- **A genuine Chromium behavior** specific to async SW responses for iframe
  (not top-level) navigations under COEP. This would be surprising — async
  SW-intercepted navigation responses are an extremely common, well-
  established pattern (offline-first PWAs rely on exactly this) — but
  hasn't been ruled out, and the interaction with COEP specifically wasn't
  something clearly documented that was found during this session.
- **An artifact of the `claude-in-chrome` browser-automation extension**
  used to drive this testing session specifically — e.g. the extension's
  own content-script injection into frames might not reliably re-attach
  after a delayed navigation completes, making `contentDocument` access
  *from the automation tooling* unreliable even if a real end-user's
  browser rendered the iframe correctly underneath. This was flagged as
  plausible but not verified either way (would need testing in a normal,
  non-automated Chrome window/profile to distinguish from the first
  hypothesis).

**Next step for whoever picks this up:** test the iframe flow in an
ordinary Chrome tab, driven by hand (not through the `claude-in-chrome`
extension) — if it renders correctly there, the bug is in the automation
tooling and Phase 3's implementation is already correct as committed-ready;
if it *also* fails in a normal browser, the async-iframe-navigation timing
issue is real and needs a different fix (candidates to try: forcing the SW
to `event.waitUntil()` in addition to `respondWith()`; checking whether
`Response.clone()` or a fresh `Response` object constructed at the very
end (not `await`ed through a stored variable) changes anything; checking
whether disabling COEP entirely on the playground makes the async-iframe
case work, which would confirm/deny the COEP-specific half of the first
hypothesis in isolation).

Do **not** commit `previewProtocol.ts`/`PreviewServiceWorker.ts`/the
`Preview.ts`/`tsup.config.ts`/`package.json` changes until Phase 3 is
confirmed actually working end-to-end (iframe rendering, not just the
underlying fetch relay) — they're left uncommitted in the working tree
specifically so that determination can still be made before they land.

## Next plan

Ordered by dependency. Each step should be verified live (typecheck → unit
tests → build → real browser check) before moving to the next, matching
the method used throughout this project so far — don't batch multiple
unverified steps together.

1. **Resolve the Phase 3 iframe bug** (see above). Concretely:
   - Open the playground in a normal, hand-driven Chrome window (not
     through `claude-in-chrome`). Register the SW, spawn a guest
     `http.createServer()`, point the iframe at `dwc.preview.url(port)`.
   - If it renders correctly by hand: the automation tooling was the
     confound. Phase 3's code is done — just commit the files listed above
     as uncommitted, then move to step 2.
   - If it *also* fails by hand: the async-iframe-navigation issue is
     real. Try, in order: (a) add `event.waitUntil(relayPromise)` alongside
     `event.respondWith()` in `PreviewServiceWorker.ts`'s fetch handler,
     in case iframe navigations need the extended-lifetime signal
     `waitUntil` provides on top of what `respondWith` alone guarantees;
     (b) temporarily strip `Cross-Origin-Embedder-Policy`/
     `Cross-Origin-Opener-Policy` from `vite.config.ts`'s
     `crossOriginIsolationHeaders()` and retest — if the async-iframe case
     starts working with COEP off, the bug is a genuine COEP+SW+iframe
     interaction and the fix likely has to live in how the response is
     constructed (worth searching Chromium bug tracker / web.dev for
     "service worker iframe navigation COEP" once confirmed); (c) as a
     fallback, consider whether Phase 3 even needs the iframe to receive
     the *first* navigation via the SW at all — an alternative is loading
     the iframe from a same-origin static shell first (`about:blank` or a
     trivial static page, which doesn't go through the SW) and then having
     that shell's own script drive the real content in via
     `dwc.preview.fetch()` + `document.write()`/DOM manipulation, sidestepping
     SW-intercepted navigation for the top document entirely (sub-resource
     fetches from an already-loaded document are confirmed working fine
     even async, per the plain-`fetch()` test above — it's specifically
     the *navigation* case in question).

2. **Commit Phase 3** once actually confirmed working, then update the
   playground's `main.ts` with a real demo (spawn a small `http` server,
   `enable()` the preview, point the iframe at it) so the feature is
   exercised by the playground itself, not just by ad-hoc test scripts.

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
