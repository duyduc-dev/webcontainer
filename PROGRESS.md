# Progress notes — real npm install + dev-server preview

Written to hand off work-in-progress across devices.

**Two threads live in this file, both now on `main`:**
- **Docs site + Playground demo** (section 0 below), already pushed to
  `origin/main` and live at `https://duyduc-dev.github.io/webcontainer/`.
- **Real npm install / dev-server preview** (sections 1–6 below, the
  original content of this file). Correction (this session): this was
  previously described here as living on a separate `feature/new-core`
  branch "not yet merged to `main`" — that was stale. `feature/new-core`
  is fully contained in `main`'s history (0 commits ahead) and `main` is
  36 commits ahead of it; every file this section references
  (`vm.ts`, `readline.ts`, `worker_threads.ts`, the `execFileSync` sync
  bridge, etc.) exists only on `main`. All of sections 1–6 is committed
  directly on `main`, not on a separate branch. `feature/new-core` is
  stale and can be deleted once someone confirms nothing else still
  points at it.

## 0. Docs site (GitHub Pages) + Playground demo — `main` branch

Goal for this thread: a public docs site for `@dwc/core` with a live,
editable code sandbox embedded in it (StackBlitz-style — edit a
file, see it rebuild and re-preview, entirely client-side). Everything
below is already committed and pushed to `origin/main`; the GitHub Actions
workflow (`.github/workflows/deploy-docs.yml`) redeploys automatically on
every push that touches `apps/docs/**` or `packages/core/**`.

### Shipped and verified

- **CI actually builds `@dwc/core` before `apps/docs`, and redeploys on
  core-only changes too.** Two separate bugs: the workflow only ran
  `pnpm --filter docs build` (now `pnpm --filter docs... build`, which
  topologically builds workspace deps first), and its `paths:` trigger
  only watched `apps/docs/**` (now also `packages/core/**`). Without
  both fixes the deployed site could silently run stale `@dwc/core` code
  indefinitely.
- **Real `@dwc/core` bug: a consumer bundler can't always re-bundle a
  worker file.** `tsup`'s default code-splitting factored shared code
  across `dist/index.js` and the `dist/workers/*/worker.js` files into
  sibling `chunk-*.js` files — fine for a plain npm install (the whole
  `dist/` ships together), but Vite's `new Worker(new URL(...))` handling
  copies a worker file out to its own `assets/` dir *without* recursively
  re-bundling it, so the copied file's `chunk-*.js` imports 404'd. Every
  `dwc.fs`/`dwc.process` call then hung forever with zero console output
  — nothing threw, because `fsClient.ts`/`fetcherClient.ts`/
  `processClient.ts`'s spawned workers never had an `onerror` handler, so
  a worker script load failure was silently swallowed. Fixed both ends:
  `tsup.config.ts` disables `splitting` for the worker entry points (each
  is now fully self-contained), and all three clients now reject pending
  requests on `worker.onerror` instead of hanging. This is a real,
  general library bug — affects any consumer deploying under a subpath
  with a bundler that doesn't recursively re-bundle copied-out workers,
  not just this docs site.
- **Real `@dwc/core` bug: the `"listen"` event fired from the wrong
  message.** `bindings/net.ts`'s `net.Server.listen()` posts `net-listen`
  then `net-pipe-listen` as two separate, sequential messages for one
  `.listen()` call. The top-level `dwc.addEventListener("listen", ...)`
  event — what a host page uses to know a preview URL is ready — fired
  from the *first* message, but `dwc.preview.fetch()`/the iframe-preview
  path depends on `net-pipe-listen` having *already* landed
  (`netRelay.pipeConnect()` only succeeds once that registration exists).
  Under normal conditions the gap between the two messages is far too
  narrow to matter, but it was real and reproducible: confirmed failing
  repeatedly on a fresh page's very first preview, fixed by moving the
  `"listen"` event to fire from `net-pipe-listen` instead (the message
  that actually establishes reachability), verified with new unit tests
  in `processClient.test.ts` and dozens of clean live reproductions
  after the fix (both a direct `dwc.preview.fetch()` stress test and the
  full iframe/Service-Worker path, 25+ successes with zero failures,
  every time run **locally**).
- **`process.kill()` added to `@dwc/core`'s public API** — a real,
  previously-missing capability (no way to stop a spawned process short
  of it exiting on its own). Threaded through end-to-end: `apis/
  Process.ts` → `PROCESS_KILL` request → kernel `processClient.ts`
  (reuses the existing "exit" cleanup path, code `143` matching
  `child_process`'s own killed-child convention). Unit tested at both
  layers.
- **The Playground demo** (`apps/docs/src/docs/pages/Playground.tsx`):
  a real multi-file project (`server.js` + `greeting.js`, genuine
  cross-file `require("./greeting")` resolution, not a single-file
  toy), with tabs to switch/add/delete files; editing any file debounces
  into an automatic kill-old/spawn-new restart (uses `process.kill()`
  above), like `vite dev`; the whole file set persists to
  `localStorage`, with a **Reset** control back to the example.

### Previously-suspected known limitation — CLOSED, was a testing artifact

On GitHub Pages specifically (never reproduces on `localhost`/`vite
preview`), a fresh page's first preview could fail with `dwc preview relay
error: ... nothing is listening on port 3000` even though the guest
server was confirmed listening. Original evidence gathered in an earlier
session:

- `dwc.preview.fetch(port, "/")` called **directly** (bypassing the
  Service Worker/iframe entirely) succeeds every time, including at the
  exact moment the iframe path is failing — so the kernel/netRelay logic
  itself is healthy. The bug is isolated to the Service-Worker-mediated
  relay (SW → `postMessage` → host page's `handleRelay` → back to SW).
- Manually attaching a raw `navigator.serviceWorker.addEventListener
  ("message", ...)` listener on the host page and then triggering a new
  iframe load shows **zero relay messages ever arrive**, even though the
  error text visibly displayed can only be produced by that exact relay
  path having run and failed — not yet reconciled, and not investigated
  further.
- Three different app-level mitigations were tried and **none** fixed
  it: re-navigating the same iframe URL, a full respawn (kill + re-spawn
  the process, same as clicking the demo's own "Run now" button),
  and a respawn with 2s/4s/8s backoff. Diagnostic logging showed the
  backoff version retrying in an unbounded loop (dozens of respawns over
  tens of seconds), never once succeeding via the Service Worker path,
  while a **direct** kernel fetch succeeded throughout — i.e. this isn't
  a "needs a moment to settle" timing issue at the app layer at all.
  All three attempts were reverted; the Playground page is back to the
  simple version (see `git log -- apps/docs/src/docs/pages/
  Playground.tsx`, look for "Revert the preview auto-retry experiments").
- The failure was reproduced dozens of times, but every reproduction
  followed **this session's own test methodology**: `navigator.
  serviceWorker.getRegistrations()` → `unregister()` → immediate reload,
  repeated 15+ times in rapid succession against the same origin within
  about 20 minutes, to force a "fresh SW" condition for testing. That is
  not something a real visitor's browser ever does (a real browser
  registers this site's Service Worker once, ever). The leading
  hypothesis is that this specific Chrome profile's internal
  Service-Worker bookkeeping for `duyduc-dev.github.io` got wedged by
  that churn, rather than this being a library or app defect — but this
  is **not confirmed**, only inferred from the pattern (kernel healthy +
  zero relay messages arriving + a genuinely fresh, never-before-used
  browser tab in the *same* profile still reproducing it, which a
  brand-new profile/incognito window was never actually tested against
  to fully rule the theory in).

**Follow-up session, resolved:** ran exactly the two experiments this
doc called for, via Playwright/headless Chromium against the live
`https://duyduc-dev.github.io/webcontainer/docs/playground`:

- 8 genuinely fresh browser contexts (`browser.newContext()` — no prior
  storage/registration, equivalent to a brand-new incognito window per
  visit), each doing one normal visit with zero manual SW interaction:
  **8/8 succeeded.**
- 15 rounds in a single context reproducing the *exact* churn
  methodology the original session used —
  `navigator.serviceWorker.getRegistrations()` → `unregister()` →
  immediate reload, repeated back-to-back — to see if the churn itself
  is sufficient to trigger it outside that one wedged profile:
  **15/15 succeeded.**

23/23 total, zero failures, including under the specific stress pattern
that originally produced the bug. Per this doc's own stated closing
condition ("if it does not reproduce in a clean profile, this can be
closed as a testing artifact, not a real gap"): **closed.** The leading
hypothesis — that one specific Chrome profile's Service-Worker
bookkeeping for `duyduc-dev.github.io` got wedged by that session's own
unusually aggressive manual churn — is now the confirmed explanation, not
a library or app defect. No code changes made. (Scripts used:
`repro_gh_pages_preview.mjs` / `repro_gh_pages_churn.mjs`, not committed
— ad hoc verification only.)

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

## 2. Dev-server preview (StackBlitz-style) — Phases 1–3 DONE

Goal: run something like `npm run dev` (Vite) inside the sandbox and see it
rendered live in the host page, the way StackBlitz WebContainers do. Researched
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

**Pick up here (updated):** item 7's own "browser-profile-artifact" theory
for the `npm run dev` preview failure is now DISPROVEN - see item 8 at the
very end of this file. It's a real, 100%-reproducible bug, narrowed down
precisely: the three `net.Server.listen()` calls traced on port 5173 are
all vite's own **port-availability probes** (opened and closed
immediately) - the real bind, and vite's own ready banner, are gated
behind `await environments.client.pluginContainer.buildStart()` (real
rolldown/WASM code), and the process reliably dies ~8-9 seconds into that
call, every time, before it ever returns. Proven (via a 10,000x bump to
`drain()`'s own idle-exit grace period, no change in outcome) that this is
**not** an eventLoop-yield-budget issue. A plain `worker_threads.Worker` +
synchronous `fs.readFileSync()` repro completed in under 50ms, ruling out
the leading hypothesis (a hung sync-fs bridge call inside rolldown's own
WASI thread pool) in its simplest form. What's next: find out exactly what
`pluginContainer.buildStart()` calls for a bare vanilla template, and
narrow the ~8-9s gap to one specific call. Item 8 has the complete
diagnostic trail, what's been ruled out, and the concrete next step.

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
   archived) for the full design discussion, including researching how a
   comparable in-browser sandbox could solve the same problem (a
   transpile-to-CJS approach, for the same synchronous-require-via-
   Atomics.wait reason this project has - several of its concrete lessons
   were folded in anyway, see below).

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

   **A real correctness bug in the ESM loader itself, found continuing this
   work in a later session: dynamic `import()` was resolved EAGERLY, at
   scan time, instead of lazily, at call time.** `esmLoader.ts`'s
   `buildModule()` statically scans a module's source for `import(...)`
   call sites and, for every match, immediately resolved and built the
   target - correct for a real STATIC `import` (genuinely evaluated eager
   per spec) but wrong for dynamic `import()`, whose entire point is
   deferred, Promise-returning resolution: a specifier that's optional or
   conditionally-never-called must not crash module evaluation just
   because it's textually present. This surfaced as real Vite's own
   `dist/node/chunks/node.js` crashing immediately with `Cannot find
   module 'esbuild'` - `esbuild` is a real, optional peer dependency
   (`peerDependenciesMeta: { esbuild: { optional: true } }`, correctly NOT
   installed by real npm), referenced only inside
   `const importEsbuild = () => (esbuild ||= import('esbuild'))`, a
   function never even called by `vite --version`. Fixed: a matched
   dynamic `import(x)` call site is now rewritten to
   `globalThis.__dwcDynamicImport(fromPath, specifier)`, a shared async
   function (assigned fresh on every `createEsmLoader()` call, since
   there's exactly one esmLoader per process) that only resolves `x` when
   actually invoked - any resolution failure becomes a properly rejected
   Promise, not a synchronous crash during module load, matching real
   `import()` semantics exactly. Verified live (the `esbuild` crash is
   gone) and by a new moduleLoader.test.ts case asserting a module
   referencing-but-never-calling a dynamic import of a missing package
   evaluates cleanly, rejecting only if actually awaited.

   That one fix alone advanced the real error several times in a row -
   each of the following was found by re-running the real installed
   `vite.js` after the previous fix and reading whatever `SyntaxError:
   ... does not provide an export named 'X'` (a real ESM named-export
   miss - see the CJS-shim mechanism above for why a builtin's missing
   member surfaces exactly this way) or `Cannot find module 'X'` came back
   next, same iterative method as everywhere else in this project:

   - `module.createRequire` - real Vite repeatedly does
     `createRequire(import.meta.url)`, both stored (`const require =
     createRequire(import.meta.url)`) and called inline
     (`createRequire(import.meta.url)('pnpapi')`, wrapped in its own
     try/catch). Added, reusing moduleLoader.ts's real `createRequire`
     machinery (see the `.resolve` bug below for a subtlety found later).
   - `util.styleText` - real Vite's CLI version-print path. Implemented
     with real Node's own ANSI code table and the real TTY-aware no-op
     rule (`validateStream` checked against `stream.isTTY`, default
     `process.stdout` - whose `.isTTY` is always `false` in this runtime,
     so this correctly no-ops exactly like real Node would on any
     non-TTY stream, not a shortcut).
   - `fs.readdir`/`fs.realpath` (callback forms) - only the `*Sync`
     versions existed; real Vite's own node.js chunk does
     `import { readdir, realpath } from 'node:fs'` at its top level.
   - `fs.promises.constants` - a plain passthrough (same object as
     `fs.constants`), not a promise-wrapped method; real Vite does
     `import { constants } from 'node:fs/promises'`.
   - `module.Module` - the `Module` *class* itself (`import { Module, ...
     } from 'node:module'`), used only as `Module.register`/
     `Module.registerHooks` presence checks (Node 20.6/22.15 experimental
     loader-hook APIs, feature-detected to build an off-thread config-file
     importer). Left genuinely `undefined` on both, matching the
     `vm.ts`/`worker_threads.ts` precedent - correctly makes Vite fall back
     to its own no-off-thread-importer path, same as a real older Node.
   - `util.parseEnv` - real Node's own dotenv-compatible `.env` parser
     (Vite's `--envFile` support); implemented as the actual well-known
     dotenv `parse()` algorithm (single-regex line scanner), not a
     reduced approximation.
   - `util.stripVTControlCharacters` - the real, well-known "ansi-regex"
     pattern (matches both CSI and OSC escape sequences), the same codes
     `styleText` above produces.

   **`perf_hooks`/`worker_threads` — DONE.** `perf_hooks` needed only
   `performance.now()`/`.timeOrigin` (traced against real Vite's own CLI
   entry point - `PerformanceObserver`/marks/measures aren't touched).
   `worker_threads` needed `MessageChannel`/`MessagePort` for real (already
   a native Web API in this Worker realm, just missing Node's own
   `.ref()`/`.unref()`, added as safe no-ops) plus a `Worker` class that
   **throws a clear "not implemented" error** if actually constructed,
   matching the existing `vm.ts` precedent (`runInNewContext`/
   `createContext` left unimplemented rather than faked) - real in-VM
   worker-thread execution is a substantial separate undertaking, not
   something to fake quietly. `module.builtinModules`/`isBuiltin` was
   already implemented from earlier session work.

   **A real, structural wall was hit next: rolldown-vite's native binding.**
   Real Vite has migrated its bundler internals to **rolldown** (a
   Rust-based bundler, "rolldown-vite"), loaded through a native N-API
   `.node` addon on every real OS platform - fundamentally impossible to
   load inside a browser Worker sandbox (no native binary execution at
   all). This is a different *class* of gap than everything above: not a
   missing JS shim to write, but a genuine capability this environment
   structurally lacks on the native path.

   Real rolldown's own source already anticipates exactly this class of
   sandbox: `node_modules/rolldown/dist/shared/binding-*.mjs` checks
   `globalThis.process?.versions?.["webcontainer"]` (the real, published
   StackBlitz WebContainers convention for "I'm in a WebContainer-shaped
   sandbox, adapt") and, if set, calls its own
   `src/webcontainer-fallback.cjs`: downloads a **WASM/WASI** build of the
   binding (`@rolldown/binding-wasm32-wasi`) via
   `execFileSync('pnpm', ['i', bindingPkg], { cwd, stdio: 'inherit' })`,
   then `require()`s the result instead of the native addon. Since this
   runtime genuinely IS that same shape of sandbox, `process.versions.webcontainer`
   was set (worker.ts, an honest one-line marker - this project's own
   version number, not a claim to literally be StackBlitz's product) to
   let rolldown's own real fallback code run, rather than reimplementing
   any of its logic.

   That fallback needed three things this runtime didn't have, all now
   built and verified live:

   - **`child_process.execFileSync` — a real, new synchronous kernel
     bridge**, the same *class* of mechanism Phase 4/5 built for
     `fs.*Sync` (a SharedArrayBuffer + `Atomics.wait`/`notify` pair), but
     serviced by the **kernel worker's own thread** rather than a
     dedicated FS-Worker-style server, since "run this program to
     completion" means reusing the real spawn/boot orchestration
     `cp-spawn`/`cp-exec` already do (async internally; only the
     *requesting* process worker's thread blocks, via `Atomics.wait`, for
     however long the real program takes to exit - up to a 15-minute
     timeout, since this bridge's own traced call runs a real npm-registry
     install and this project's own installs have taken minutes live).
     New: `kernel/childProcess/syncExecWireFormat.ts` (wire format, unit
     tested), `workers/process/syncExecClient.ts` (guest-side blocking
     client), `processClient.ts`'s `createSyncExecChannelFor`/
     `runProgramToCompletion` (kernel-side server + program-runner,
     resolving `command`/`args` via the same `resolveEntryPoint` `cp-spawn`
     uses, not shell tokenization, so real `env` threads through cleanly).
     `spawnSync`/`execSync` remain deliberately unimplemented (no traced
     need yet) - only `execFileSync` is real.
   - **A `pnpm` compatibility shim** (`examples/playground/src/vendorNpm.ts`,
     `/bin/pnpm.js`) - not real pnpm (a whole separate CLI not worth
     vendoring for one call shape). Rewrites `pnpm i <pkg>` into
     `npm install <pkg> --no-save` and hands off to the SAME real,
     already-vendored npm CLI already installed at `/bin/npm.js`, via the
     exact same `require(NPM_VFS_ROOT + '/bin/npm-cli.js')` + `process.argv`
     mutation technique the existing `npm.js`/`npx.js` shims already use.
     Only `pnpm i <one package>` is supported; anything else exits
     non-zero with a clear message.
   - **A real bug in `module.createRequire()`, found by this new path**:
     it returned a plain function with no `.resolve` property at all.
     TypeScript's structural typing silently accepted this (a function
     with fewer declared params **is** assignable to a type expecting
     more, a real, easy-to-miss TS conformance gap) - `tsc --noEmit`
     reported zero errors while the feature was actually broken. Real
     rolldown's own fallback code calls
     `__require.resolve('rolldown/package.json')` before anything else,
     so every `execFileSync` attempt was silently failing at that exact
     line and being swallowed by rolldown's own `try/catch`, making the
     symptom look identical to "nothing happened at all." Fixed by
     threading moduleLoader.ts's real `createRequire(fromPath)` (which
     already had a working `.resolve`) all the way down through
     `builtins/index.ts` and `module.ts`, instead of a flattened
     `(fromPath, specifier) => unknown` callback - `worker.ts`'s own
     wiring needed a mutable "fill in after moduleLoader exists" cell
     either way (same chicken-and-egg `vendoredBuiltins`-built-before-
     `moduleLoader` situation `net`/`child_process` already have), just
     now filled with `moduleLoader.createRequire` instead of a narrower
     `requireSync`.

   **Verified live, all three together**: a direct diagnostic script
   calling `require('child_process').execFileSync('pnpm', ['i', 'left-pad'], ...)`
   completed synchronously with the real npm install output and exit code
   0. Then, running the real installed `vite.js` end-to-end: the console
   log line `[rolldown] Downloading @rolldown/binding-wasm32-wasi@1.2.7 on
   WebContainer...` appeared (rolldown's own real fallback code, actually
   reached and running), and `/tmp/rolldown-1.2.7/node_modules/@rolldown/binding-wasm32-wasi/`
   was confirmed to exist on disk afterward, with its own real dependencies
   (`@emnapi/*`, `@napi-rs/*`, `@tybys/*`, `tslib`) - a genuine npm-registry
   install completed entirely through the new sync bridge + pnpm shim + the
   `.resolve` fix, exactly as designed.

   **`node:wasi` — DONE, committed.** Traced exactly what the real
   downloaded `.wasm` binary needs via `WebAssembly.Module.imports()`
   (not a speculative full preview1 surface, per this doc's own earlier
   note): only 21 `wasi_snapshot_preview1` functions (file I/O -
   `fd_read`/`fd_write`/`fd_readdir`/`path_open`/etc. - plus
   `environ_get`, `clock_time_get`, `random_get`, `proc_exit`,
   `poll_oneoff`, `sched_yield`; no networking, no rename/symlink-heavy
   surface) and exactly one import from module `"wasi"`:
   **`thread-spawn`** (the WASI-threads proposal - this is the actual,
   narrow reason a `Worker` is needed at all, not generic multi-threading
   - see the `worker_threads.Worker` note below).

   Rather than hand-write that 21-function ABI (real, fiddly
   memory-layout code - iovecs, dirent structs, filestat structs - with
   no live wasm module to verify against line-by-line until the very end),
   vendored **@tybys/wasm-util v0.10.1's real, complete preview1
   implementation** (MIT licensed, ~2700 lines across
   `runtime/node/vendor/wasi/*.mjs` + 3 sibling files) instead - it
   already implements real Node's exact `WASI` class shape
   (`.wasiImport`/`.initialize()`/`.start()`) and error-code-to-WASI-errno
   mapping, and accepts a **pluggable Node-fs-shaped `options.fs`**
   parameter by design. The only new code
   (`runtime/builtins/wasi.ts`'s `createWasiFsAdapter`) translates that
   package's `fs.*Sync` calls onto this project's EXISTING `FsBuiltin`
   (the same sync-fs-bridge primitives `fs.ts` already exposes to guest
   code) - openSync/readSync/writeSync/closeSync forward directly;
   numeric POSIX open flags translate to FsBuiltin's own string-flag
   convention; `{bigint:true}` Stats and `withFileTypes` Dirents are
   synthesized from FsBuiltin's plainer StatResult (no real inode/device/
   per-field-timestamp model exists in this VFS, so dev/ino/nlink are
   honest fixed stand-ins and atime/ctime reuse mtime, matching the
   chown/utimes precedent elsewhere in this project); hardlink is a
   one-time content copy (no real shared-inode aliasing exists to back
   real hardlink semantics).

   Two real bugs found and fixed getting a live wasm module through this,
   both via the same "run it, find the real cause" method as everywhere
   else in this project - a hand-rolled minimal 692-byte wasm module
   (compiled from WAT via the `wabt` npm package, not committed as a
   build step) doing a real `path_open`/`fd_write`/`fd_read`/`fd_close`
   round-trip against this project's own VFS caught both, live, via
   `wasi.test.ts`:
   - **FsBuiltin.openSync('/', 'r') threw EISDIR.** Real Node allows
     opening a directory fd (just not reading bytes from it) - needed for
     preopens (`WASI.createSync()`'s own preopen setup does exactly
     `fs.openSync(preopenPath, 'r', mode)`, and every real preopen is a
     directory). Fixed in the adapter: a directory path gets a synthetic
     fd tracked entirely in the adapter's own map (a negative-numbered
     range FsBuiltin's own fd table never allocates into), never routed
     into FsBuiltin's real file-only fd table at all.
   - **FsBuiltin.openSync('w', ...) only snapshots an empty in-memory
     buffer - the real VFS isn't touched until closeSync() writes it
     back.** Real Node's `open('w')` creates/truncates the file on disk
     immediately, and WASI's own `path_open` relies on exactly that: it
     calls `fstatSync()` on the fd right after opening it (to learn the
     new file's type/size), which - before this fix - saw a
     not-yet-existent file and failed with a spurious ENOENT on every
     single file creation. Fixed by having the adapter eagerly persist an
     empty file via `fs.writeFileSync` before deferring to FsBuiltin's
     own (unchanged) lazy-write-on-close behavior.

   **Verified live** (not yet against the real rolldown binding - see
   below): the compiled test wasm module's real `path_open`/`fd_write`/
   `fd_read`/`fd_close` round-trip succeeds with zero errno across every
   call (file content read back byte-correct from this project's actual
   VFS, independent of the wasm module's own fd table), `fd_write` to
   stdout (fd 1) reaches a real `print` callback, and
   `environ_sizes_get`/`random_get`/`clock_time_get`/`sched_yield` all
   return successfully without trapping.

   **`worker_threads.Worker` — DONE, committed, verified end-to-end live.**
   The real reason a `Worker` is needed turned out to be much narrower
   than "make worker_threads work in general": `@napi-rs/wasm-runtime`'s
   own `wasi-worker.mjs` (a FIXED file the library itself ships, not
   arbitrary guest code) uses `new Worker(filename)` purely to implement
   WASI's `thread-spawn` import - spawn a new thread that re-instantiates
   the SAME wasm module with SHARED memory and runs a fixed bootstrap.
   That bootstrap needs only: a working `require()` (this project's
   existing moduleLoader against the real VFS), a `wasi` builtin (done,
   above), and `require('worker_threads').parentPort` wired to whatever
   spawned it - the rest (message-passing protocol, actual wasm
   re-instantiation with shared memory) is entirely handled by
   `@napi-rs/wasm-runtime`'s own already-correct JS once npm-installed,
   nothing new to write there.

   Built exactly the three pieces this doc previously scoped: (1) a new
   kernel message (`wt-request-sync-fs-channel`) granting a *second* sync-fs
   channel to an already-running process worker - `createSyncFsChannelFor
   (fsClient)` in `processClient.ts` was already a standalone, repeatable
   helper, so this was a small addition, not a redesign; (2) a new bundled
   worker entry point (`workers/workerThreads/worker.ts`, its own tsup
   entry, mirroring how `workers/process/worker.ts` itself is loaded) that
   boots a minimal guest environment - require/fs/process/console/timers/
   Buffer, reusing the existing moduleLoader/createBuiltinModules/
   createFsBuiltin machinery verbatim, deliberately NOT a full nested
   Node sandbox (no net/http/child_process/readline - add if/when
   something traces a need) - and wires `parentPort`; (3)
   `worker_threads.ts`'s real `Worker` class, spawning that entry as a
   genuine nested browser Worker directly from the calling guest
   process's own Worker context (no kernel relay for the resulting
   parentPort<->Worker channel itself - only for the one-time sync-fs
   grant), matching real Node's own direct, non-kernel-mediated
   worker_threads semantics.

   **Two real, load-bearing bugs found and fixed getting an actual
   message round-trip working live** (via a real Playwright Chromium run
   against `examples/playground`'s dev server, `dwc.process.spawn()`ing a
   guest script that does `new Worker(path)` + `parentPort` messaging for
   real - not a unit test, since this needed real nested-Worker/
   cross-origin-isolation/SharedArrayBuffer behavior no Node-based test
   runner provides):
   - **The channel-grant round trip (and the live Worker itself) weren't
     `ref()`d.** A guest script with no other pending work (no timers, no
     net requests - exactly `new Worker(...)` + one `postMessage()`, the
     realistic common case) finishes its own top-level code almost
     instantly; `hasPendingWork()` then read false, and this process
     (along with every worker it had spawned, including the
     workerThreads one that hadn't even finished booting yet) tore itself
     down via the SAME drain()/exitProcess() path real script completion
     already uses - with zero errors, since nothing had actually failed,
     it just looked "done." Confirmed live: the nested worker's own
     script never even got a chance to load before its parent process,
     and therefore itself, was torn down. Fixed by `ref()`ing the event
     loop for as long as a `worker_threads.Worker` instance is alive
     (matching real Node: an active, non-unref'd Worker keeps its owner
     process alive), released by `.terminate()`/`.unref()`.
   - **A caller's first `postMessage()` raced ahead of this project's own
     internal "boot" message and was silently dropped.** `spawnWorker()`
     returns the real `Worker` object synchronously, but its "boot"
     message (the entry path, env, granted sync-fs channel) is posted
     only after the async channel-grant round trip resolves - real code
     (this project's own end-to-end test included) calls `.postMessage()`
     immediately after construction, with no synchronization, and that
     message reached the nested worker BEFORE "boot" did. Fixed by
     queuing a `DwcWorker`'s own `.postMessage()` calls on the same
     `ready` promise `spawnWorker()` resolves after posting "boot" -
     ordering guaranteed by the promise chain itself, transparent to
     callers (still looks synchronous).
   - A closely related, subtler gap surfaced by the SAME trace, fixed
     alongside the two real bugs above even though it never actually
     fired once they were fixed: the nested worker's own internal message
     re-dispatch (`workers/workerThreads/worker.ts`'s `parentPort`) had no
     buffering for a message arriving before the guest script's own
     `parentPort.on("message", ...)` call - unlike a real `MessagePort`,
     which queues internally until its first listener attaches. Real
     script evaluation (resolving the entry module via the sync-fs
     bridge's own `Atomics.wait` round trips) takes real, measurable time,
     during which an already-in-flight message could otherwise arrive and
     find zero listeners, vanishing. Fixed with an explicit pending-queue,
     flushed in order to the first `parentPort.on("message", ...)`
     listener that attaches.

   **Verified live, full round trip**: a real guest process does
   `new (require('worker_threads').Worker)('/child.mjs', { workerData })`;
   the nested worker gets a real sync-fs-channel grant from the kernel,
   boots a real `.mjs` ESM module through the existing ESM loader,
   `parentPort.on('message', ...)`/`.postMessage(...)` round-trip real
   data end-to-end, `isMainThread` correctly reads `false` inside the
   nested worker and `true` in the spawning process, and `workerData`
   passes through intact (`{"hello":"world"}` observed byte-for-byte on
   the other side).

   **Follow-up session, same day: re-ran the real `npm install vite` →
   real `vite.js` trace from here, live.** Real, substantial further
   progress - found and fixed four more real bugs, in order, each
   confirmed via the same "rerun the real thing, read the real error"
   method as everywhere else in this project, live against
   `examples/playground`'s dev server (`npm install vite`, real registry,
   ~1-2 min; then spawning the real installed `node_modules/vite/bin/
   vite.js --version`):

   1. **moduleLoader.ts's CJS `require()` had NO "exports" map support at
      all - main-field + plain subpath only** (already known and
      explicitly documented as out of scope in the loader's own doc
      comment, from before this session). Real `@napi-rs/wasm-runtime`
      (rolldown's own WebContainer-fallback dependency) ships NO "main"
      field, only `{".": {"import": "./runtime.js", "require":
      "./runtime.cjs"}}` - every `require('@napi-rs/wasm-runtime')`
      failed with "Cannot find module", despite the real files sitting
      right there on disk (confirmed via `dwc.fs.readdir()`). Fixed by
      wiring the ALREADY-EXISTING (but never-called) `resolveExportsMap()`
      helper (in `resolveSpecifier.ts`, originally built for the ESM
      loader) into `resolveBareSync()`, parameterized with a new
      `CJS_EXPORT_CONDITIONS = ["node", "require", "default"]` (the
      opposite preference order from `ESM_EXPORT_CONDITIONS`'s
      `"import"` - a require() call site must get the CJS build of a
      dual-published package, not the ESM one it can't evaluate). Real
      Node semantics: an "exports" field replaces main-field/subpath
      guessing ENTIRELY for that package, not just adds to it - matched
      exactly, including for the miss case (verified via three new
      `moduleLoader.test.ts` cases).
   2. **`export * from '...'` (a wildcard re-export-all statement) was
      entirely unhandled by `esmInterop.ts`'s ESM→CJS retry transform.**
      Real `@emnapi/core` (an `@napi-rs/wasm-runtime` dependency, `"type":
      "module"`, no CJS build) does exactly `export * from
      '@emnapi/wasi-threads';` at its top level - the retry compile
      failed the same way the original compile did, surfacing the same
      unhelpful "Cannot use import statement outside a module" either
      way. Fixed with a new `EXPORT_STAR_RE` pattern, rewritten to
      `Object.keys(require(specifier)).forEach(...)`, re-exporting every
      named key except `default` (real ESM re-export-all semantics).
   3. **A real, more serious latent bug this surfaced: `esmInterop.ts`'s
      regex-based rewriter had NO string/comment/template-literal masking
      at all - unlike `esmLoader.ts`'s own specifier scanner, which
      already solved exactly this problem.** Real `@emnapi/core` throws
      `new TypeError("Invalid \`options.context\`. Use \`import {
      getDefaultContext } from '@emnapi/runtime'\`")` - a plain
      human-readable error-message STRING that happens to contain real
      `import` syntax as advice text. The old `IMPORT_NAMED_RE` matched
      it unconditionally (regex has no notion of "inside a string") and
      rewrote the STRING LITERAL ITSELF into broken code, producing a
      much more confusing failure one level removed from the original
      problem (`new Function()` throwing "missing ) after argument
      list" - confirmed live via `node --check` on the transformed
      output, pinpointing the exact corrupted line). Fixed by exporting
      `esmLoader.ts`'s existing `maskNonCode()`/`isRealCode()` (previously
      module-private) and rewriting `transformEsmToCjs()` from sequential
      `.replace()` calls into the same "scan the real source, keep only
      matches whose position is real code per the masked text, collect
      edits by absolute offset, apply once at the end" pattern
      `esmLoader.ts` already used - every regex now independent of every
      other's output too (a real, if minor, correctness improvement on
      its own), not just fixed for this one string. Verified against the
      real, complete `@emnapi/core` source file directly (a temporary
      test compiling the real downloaded file end-to-end), plus a new
      regression test using the exact real string.
   4. **`process.execArgv` didn't exist on the guest `process` global at
      all.** Real `rolldown-binding.wasi.cjs`'s own generated
      `__getWasiWorkerExecArgv()` - reached via WASI's `thread-spawn`
      import calling into `worker_threads.Worker` for the very first
      time with a REAL wasm binary - does `process.execArgv.length`
      unconditionally, crashing every single `thread-spawn` call with
      "Cannot read properties of undefined (reading 'length')". Fixed
      with an honest `execArgv: []` (a guest process has no real `node`
      CLI invocation to have parsed flags from) on both `workers/
      process/worker.ts`'s and `workers/workerThreads/worker.ts`'s own
      `processGlobal`.

      **This fourth fix alone resolved something that looked, before it,
      like a much scarier problem**: with `execArgv` undefined, the
      `thread-spawn` failure cascaded into a genuine Rust-side panic one
      level up - `thread '<unnamed>' panicked ... OS can't spawn worker
      thread: Resource temporarily unavailable (os error 6)` from
      rolldown's own tokio runtime, which read at first like a real
      resource exhaustion or a deeper architectural problem with nested
      Worker spawning. It was neither - fixing the one real JS-level
      TypeError that preceded it made the panic disappear entirely on
      the very next run. Worth remembering if a future session hits a
      scary-looking low-level panic here again: check for a mundane JS
      exception one level up before assuming the worse explanation.

   **Verified live, in order, after all four fixes**: real `npm install
   vite` (exit 0, ~1-2 min) → real `node_modules/vite/bin/vite.js
   --version` → real `rolldown` (vite's own bundler) loads → real
   WebContainer WASM fallback triggers → real `@rolldown/binding-
   wasm32-wasi` downloads via the sync-exec/pnpm-shim bridge → real
   `node:wasi` services the wasm module's file I/O → real
   `wasi.thread-spawn` fires → real `worker_threads.Worker` spawns a
   genuine nested browser Worker running the real `wasi-worker.mjs` →
   the wasm module's own async work pool actually starts. This is
   the ENTIRE chain items 3's original WASI/worker_threads blocker was
   about, now confirmed working end-to-end with the real artifact, not
   a synthetic test.

   **`internalBinding('block_list')` — DONE, committed.** Real
   `net.BlockList`'s native half doing real IP/CIDR range matching, from
   scratch (no vendor-and-adapt shortcut exists for a genuine native
   binding the way there does for pure-JS builtins) - new
   `bindings/blockList.ts`, wired into `internalBinding.ts`'s registry.
   Scoped to exactly the 8 members `internal/blocklist.js`/`internal/
   socketaddress.js` (both already vendored verbatim, sitting unused
   until now) actually destructure: `SocketAddress`, `AF_INET`,
   `AF_INET6`, and `BlockList`'s `addAddress`/`addRange`/`addSubnet`/
   `check`/`getRules`. IPv4/IPv6 text parsing and RFC-5952-canonical
   formatting were NOT reimplemented - `bindings/ip.ts` already had real,
   tested versions (built earlier for `cares_wrap`/DNS), reused as-is;
   the only new logic is address/range/subnet storage, byte-level
   comparison, and rule-string formatting.

   Verified against **real Node directly** (`node -e "..."`, not just
   documentation), matching the "gated against real Node, rule for rule
   and answer for answer" approach `blocklist.js`'s own vendoring comment
   had aspired to but never actually built: rule string formats
   (`"Address: IPv4 x"` / `"Range: IPv4 x-y"` / `"Subnet: IPv4 x/y"`,
   IPv6 equivalents), `getRules()` returning most-recently-added first
   (not insertion order - a real, easy-to-miss detail confirmed by
   direct comparison), `check()`'s exact-family-match requirement, and
   IPv6 canonicalization specifics (only the well-known `::ffff:0:0/96`
   prefix keeps a dotted-quad tail - a *different* embedded-IPv4 form,
   e.g. a NAT64 `64:ff9b::/96` address, renders as plain hex groups
   instead, confirmed by direct comparison rather than assumed). 13 new
   unit tests encode these real-Node-verified vectors directly.

   **Verified live**: the real `npm install vite` → real `vite.js`
   trace no longer hits `block_list` at all - it now runs further and
   hits a completely different, unrelated gap (`internal/file` isn't
   vendored - see below), confirming this fix is real and complete for
   whatever vite/rolldown's own dependency chain actually needed from
   `net.BlockList`.

   **`internal/file` — DONE, committed.** Confirmed exactly as guessed:
   `buffer.js`'s own lazy `get File()` accessor, alongside the
   already-vendored `Blob`. Same trick as `internal/blob.js` right next
   to it (not a verbatim vendor of real Node's ~150-line `class File
   extends Blob` - every engine this runs on already has a spec `File`
   global in Worker scope, same constructor shape and all): new
   `internal/file.js` is a two-line shim exposing `globalThis.File`
   directly. Deliberately does NOT include real Node's own structured-
   clone transfer plumbing (`TransferableFile`/`kClone`/`kDeserialize`) -
   nothing traced needs a File surviving this runtime's own
   `worker_threads.Worker` transfer protocol specifically (see
   `worker_threads.ts`'s own doc comment on its narrow, traced scope).

   **One more real gap surfaced right after, in the exact same live
   trace: `util.types` didn't exist on this project's own hand-written
   `util` builtin at all.** Real Node exposes the SAME object two ways -
   `require('util/types')` (already vendored, registered as its own
   top-level specifier) AND `require('util').types` (a property of the
   main module) - real npm-installed code in vite/rolldown's own
   dependency tree reached for the second form
   (`require('util').types.isUint8Array(...)`), which crashed with
   "Cannot read properties of undefined (reading 'isUint8Array')" since
   nothing had ever wired `.types` onto this project's own `util`
   builtin. Fixed by invoking the already-vendored `internal/util/
   types.js` factory directly from `builtins/util.ts` and exposing its
   result as `util.types` - safe since that factory's body never
   actually touches its own require/internalBinding/process/primordials
   parameters (confirmed by reading it), only real global constructors
   already available in scope.

   **Verified live: `npm install vite` (exit 0) followed by the real,
   installed `vite.js --version` now runs to completion and prints the
   real version string** - `vite/8.2.2 linux-x64 node-v24.18.0`, exit
   code 0. This is the full chain working end-to-end for the first
   time: real npm registry install → real rolldown loading → real
   WebContainer WASM fallback → real `@rolldown/binding-wasm32-wasi`
   download via the sync-exec/pnpm-shim bridge → real `node:wasi`
   servicing the wasm module's file I/O → real `wasi.thread-spawn` →
   real `worker_threads.Worker` spawning a genuine nested browser
   Worker → real `net.BlockList`/`SocketAddress` → real `File` → a
   clean, correct exit. Every piece this multi-session investigation
   built (node:wasi, worker_threads.Worker, the "exports"-map resolver
   fix, the ESM-interop masking fix, `process.execArgv`, `net.BlockList`
   from scratch, `internal/file`, `util.types`) was load-bearing for
   this one outcome.

   **Follow-up, same day: tried a real `vite build` (a genuine 2-file
   project, not just `--version`) - found and fixed three more real
   bugs, then hit a real, unresolved design tension, not yet fixed.**
   Same live method as everywhere else in this section: `npm install
   vite` against a real `/project` with a real `index.html` + two real
   JS modules, then run the installed `vite.js build`.

   1. **`util.inspect(error)` printed `"{}"` for every real Error - a
      real, broadly-impactful bug, not specific to Vite.** This
      project's own `inspect()` was a bare `JSON.stringify`, which
      silently drops an Error's `.message`/`.stack` (both non-
      enumerable, invisible to `JSON.stringify`). Real Vite's own CLI
      does exactly `` `error during build:\n${inspect(e)}` `` around its
      top-level try/catch - every real build failure printed through
      this was reduced to the single, undiagnosable string `"{}"`,
      regardless of what actually went wrong. Fixed with a real
      Error-aware path: the real stack trace text, plus any extra own
      enumerable properties (`.code`, `.cause`, ...) appended as a
      trailing block matching real Node's own format - including
      recursing into a `.cause` chain (real rolldown's own
      WebContainer-fallback error shape, from earlier in this session)
      rather than hitting the same `"{}"` bug one level down. This is
      what actually made the REST of this list debuggable at all - every
      fix below was found by reading a real, legible error for the
      first time instead of `"{}"`.
   2. **`crypto.getRandomValues` didn't exist on `require('crypto')`.**
      Real Node exposes it directly (not just via `.webcrypto`); this
      project's own vendored `crypto.js` used the real global
      internally (backing `randomBytes`/`randomUUID`) but never
      re-exported it as a top-level member. Real rolldown's own WASM
      binding loader calls `crypto.getRandomValues(...)` directly
      (presumably a nonce/id) - fixed with a one-line re-export,
      `.bind()`-ed the same way `randomUUID`'s own wrapper already is
      (Web Crypto API methods are WebIDL-brand-checked against their
      original object).
   3. **A real Worker-global-scope-vs-Node difference: `self` is a
      getter-only accessor in a real Worker, but real Node's
      worker_threads has no such restriction.** Real
      `@napi-rs/wasm-runtime`'s own `wasi-worker.mjs` (the fixed
      bootstrap file WASI's `thread-spawn` loads inside a
      `worker_threads.Worker` - see this doc's own earlier notes) does
      `Object.assign(globalThis, { self: globalThis, ... })` at its top
      level, assuming real Node's own unrestricted global object - every
      single WASI thread-spawn crashed with "Cannot set property self of
      #<WorkerGlobalScope> which has only a getter" the moment that line
      ran. Fixed in `workers/workerThreads/worker.ts`'s own boot() by
      redefining `self` as a plain writable data property before any
      guest code runs.

      **With all three fixed, the build got much further** - past
      "vite v8.2.2 building client environment for production..." (a
      real progress message that was never reached before) - into
      genuine WASM-side bundling work, for the first time.

   **Where it stops now: a real, unresolved design tension between two
   observed failure modes, neither of which is currently correct.**
   Real `@napi-rs/wasm-runtime`'s own worker-pool code calls
   `worker.unref()` on every pool worker immediately after spawning it
   (confirmed live by reading its own compiled `emnapi-plugins.cjs`) - a
   legitimate real-Node idle-efficiency pattern there, because a
   SEPARATE primitive (a libuv-level async handle backing whatever
   native N-API work is actually in flight, PLUS Emscripten's own
   runtime-keepalive counter - both confirmed to exist in the same
   compiled output via `envObject.ref()`/`.unref()` and
   `__emnapi_runtime_keepalive_push()` calls) independently keeps a real
   Node process alive for as long as real work is pending, regardless of
   the spawning Worker's own ref state. This runtime's own event loop
   has no equivalent second signal - only the Worker's own liveness ref
   this session already built:
   - **Honoring `unref()` (real Node's own semantics, and what's
     currently shipped)**: a real `vite build` exits successfully after
     printing only its first line, `dist/` never written - the pool
     worker's own real `unref()` call released the only signal keeping
     the process alive before the real bundling work even started.
     Confirmed live, repeatedly.
   - **Making `unref()` a permanent no-op (tried, reverted)**: traded
     that for a WORSE failure - a genuine infinite hang, confirmed live
     across two separate long-timeout runs (5 minutes, then 10 minutes),
     zero progress past the same first line either way. Real Node
     processes exit once a build's real async work finishes SPECIFICALLY
     because those pool workers are unref'd; permanently ignoring that
     means nothing this runtime can currently observe ever signals
     "done."
   Kept as real, honored semantics (the first option) rather than the
   no-op: a fast, clean, debuggable failure was judged better than a
   silent, resource-consuming hang with zero feedback - but neither is
   actually correct, and this is flagged as a real, open design question
   in `worker_threads.ts`'s own doc comment on `unref()`, not a settled
   answer. The real fix needs the actual missing signal: either (a)
   wiring real `eventLoop.ref()`/`unref()` calls to whatever this
   runtime can observe of `@emnapi/core`'s own `Env.ref()`/`unref()` (the
   real N-API-level keep-alive primitive `envObject` above is an
   instance of - not yet traced further: what `envObject` actually is,
   where it's constructed, or whether this runtime has any real hook
   into it at all from outside that library's own closures), or (b) a
   deliberately heuristic compromise (e.g. a delayed/debounced `unref()`
   that only actually releases after a period of no message traffic on
   any live `worker_threads.Worker`) if the real signal turns out to be
   unreachable from here. Not yet attempted - the next concrete step for
   whoever picks this up. (`vite --version` was re-verified working
   after every fix and revert in this list, including the final one -
   this regression is specific to real build-time WASM async work,
   `--version`'s own code path never reaches it.)

   **Follow-up, next session: implemented the debounced-`unref()` compromise
   listed as option (b) above, verified it's mechanically correct, then found
   the REAL blocker is a different, deeper bug it can't fix.**
   `worker_threads.ts`'s `DwcWorker.unref()` now debounces instead of
   releasing the liveness ref immediately: the ref is only actually dropped
   after `UNREF_DEBOUNCE_MS` (3000ms) of no message traffic (sent OR
   received) on that worker, extended by `#extendDebounce()` on every
   `postMessage()` call and every incoming `"message"` event. Unit-tested in
   isolation with `vi.useFakeTimers()` (`worker_threads.test.ts`) - 6 cases
   covering the debounce window, extension-on-traffic, `ref()` cancelling it,
   `terminate()` during a pending window, and the no-double-schedule guard.

   Re-verified live against a real `vite build`, instrumented down to
   individual `eventLoop.setTimeout`/`clearTimeout` calls and the literal
   content of every message sent/received on the pool worker (temporary
   diagnostics, since removed). Two things were conclusively established:
   - **The debounce mechanism itself is correct.** It inserts and holds a
     real pending timer in `eventLoop`'s own `timers` map; `#extendDebounce()`
     correctly clears and re-schedules it on real outgoing traffic - confirmed
     via two genuine extensions, one for `@napi-rs/wasm-runtime`'s own `"load"`
     message (handing the pool worker the wasm module + shared memory) and one
     for its `"start"` message (kicking off WASI thread id 43). Along the way,
     also found and fixed a real latent bug in `eventLoop.ts` itself: its own
     internal `runOnce()` used a bare, unqualified `setTimeout` in its
     timer-wait fallback branch, which - since `eventLoop.ts` is bundled into
     the same worker script as `workers/process/worker.ts`'s own
     `Object.assign(self, {setTimeout: ...})` override - resolved through the
     scope chain to that SAME guest-facing override once boot() had run,
     recursively feeding the event loop's own internal wait back into itself
     instead of using a real host timer. Fixed by capturing
     `globalThis.setTimeout` by reference at module load time (before any
     override can exist) and using that native reference internally. Real,
     worth keeping regardless of the outcome below - but built-and-verified
     (rebuilt, full 581/581 suite still green), it turned out NOT to be what
     was breaking the build either.
   - **The debounce is not what's blocking `vite build` - a different, deeper
     bug is.** Widened `UNREF_DEBOUNCE_MS` live to 20s and then 60s (temporary,
     reverted back to 3000 after): identical result both times. After
     `"start"` is sent to the pool worker, it never sends anything back - no
     ack, no error, nothing - for the entire widened window; the debounce
     timer simply runs out with zero further traffic and releases the ref
     right on schedule, exactly as designed. A longer debounce cannot fix
     this: the real bug is a silent stall somewhere in WASI thread-spawn
     execution itself, after the "start" message is delivered - inside
     `wasi-worker.mjs`'s own message handling, this project's `parentPort`
     relay in `workers/workerThreads/worker.ts`, or the actual wasm thread
     entry point never returning or replying. Confirmed via Playwright-level
     `page.on("worker")`/`worker.on("close")` listeners too: the nested WASI
     worker is still alive (never closes) when the test's own 5-minute
     deadline is reached - not a crash, a genuine indefinite stall. Not yet
     diagnosed further - the actual next concrete step for whoever picks this
     up, separate from (and downstream of) the ref/unref question this entry
     was originally about.

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

6. **`npm create`/`npm init` — `vm`, `readline`, and real stdin all fixed;
   `npm exec`'s own spawn mechanics are next.** Real npm's own `promzard`
   dependency (used by `npm init`/`npm create` to evaluate a project's
   init-defaults script) does
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

   That unblocked npm's init flow only as far as a **different** gap:
   `Cannot find module 'readline'`, from the `read` package (npm's own
   interactive-prompt dependency, pulled in even with `-- --template
   vanilla` supplied to skip create-vite's own prompts). Investigating
   `readline`'s actual call site surfaced something bigger underneath it:
   **`dwc.process.spawn()`'s `.stdin` WritableStream had no path to the
   guest process at all** - `PROCESS_STDIN` requests had no handler
   anywhere in the kernel's router and were silently dropped by the host
   side's own `.catch(() => {})`. Fixed with a real end-to-end pipe
   (`processTable` now tracks the real Worker backing each process, kept
   deliberately separate from `ProcessEntry` itself since that's sent to
   the host via `PROCESS_LIST` and can't carry a raw `Worker` across
   structured clone; a new `PROCESS_STDIN` route forwards a chunk to that
   worker; the guest process worker exposes `process.stdin` as a real
   vendored `Readable`). Then added a real `readline` module
   (`runtime/builtins/readline.ts`) - scoped to "cooked mode" line reading
   (buffer bytes, split on newlines, emit one `'line'` event per complete
   line), not real Node's raw-mode/per-keystroke-echo/in-place-line-editing
   `readline` (which needs a real raw-mode TTY this runtime doesn't have -
   a real, documented gap for a caller driving this from a live interactive
   terminal, not silently faked).

   **Verified**: `npm create vite@latest my-app -- --template vanilla`,
   with a "y\n" written to the process's real `.stdin` a few seconds after
   spawning (auto-answering whatever confirmation prompt npm's own `exec`
   flow shows), now runs to **exit 0** with no missing-module errors at
   all. But the actual scaffolding didn't happen: `/create-vite-test` came
   back completely empty afterward, even though
   `/home/user/.npm/_npx/<hash>` shows npm's `exec` machinery DID fetch and
   cache `create-vite@9.2.0` correctly - the "> npx / > create-vite my-app
   --template vanilla" echo line printed (matching real npm's own
   about-to-run-this-command output), then nothing further, straight to a
   clean exit. This points at `npm exec`'s own mechanism for actually
   *launching* the fetched package (likely `@npmcli/promise-spawn`, a real
   `child_process.spawn()` wrapper - possibly needing `shell: true` or
   another `child_process` option/mode this runtime's own spawn
   implementation doesn't yet support) rather than anything about
   `vm`/`readline`/stdin, which are now all confirmed working correctly.
   Not yet investigated further - the next "run it, find the next break"
   candidate for whoever picks this up, separate from the Vite-dev-server
   gaps in item 3.

   **Follow-up, next session: found and fixed the actual silent-failure bug,
   then traced the real remaining gap two layers deep.**

   The "clean exit, nothing happened" symptom was a real bug in this
   runtime's own `child_process.js`, not npm doing anything unusual. `spawn()`'s
   `onExit` handler, on a resolution failure (command not found), deferred only
   the `'error'` event via `process.nextTick(() => child.emit("error", err))`
   but emitted `'exit'`/`'close'` *synchronously* right after, in the same
   call - so `'close'` (with `code=null, signal=null`, both falsy) always fired
   before the deferred `'error'`. Real npm's own `@npmcli/promise-spawn`
   (`spawn()`'s actual caller here) does exactly `proc.on('error', reject)` and
   `proc.on('close', (code, signal) => code || signal ? reject() : resolve())`
   - a Promise's first settlement wins, so `'close'` firing first with two
   falsy values silently *resolved* the promise as if the command had
   succeeded, before `'error'` ever got a chance to reject it. This wasn't
   `npm exec`-specific - it silently swallowed EVERY `spawn()` resolution
   failure system-wide, for any caller shaped like `promise-spawn`. Fixed by
   deferring all three events (`error`, `exit`, `close`) into the same
   `process.nextTick`, preserving their relative order (matching real Node,
   which emits `'error'` before `'exit'`/`'close'` for a failed spawn) while
   still giving a caller time to attach its own `'error'` listener
   asynchronously.

   Re-verified live (`npm create vite@latest my-app -- --template vanilla`,
   same harness as above): the silent no-op is now a real, honestly-reported
   failure - `npm error code ENOENT` / `npm error enoent sh: command not
   found`, exit code 1 - instead of a misleading clean exit 0 with an empty
   directory. That's the actual root cause surfacing for the first time,
   traced further:

   Real npm's own `@npmcli/run-script` (`lib/make-spawn-args.js`) always
   builds its script-running spawn with `shell: scriptShell` (default `true`
   unless a caller overrides it), which `@npmcli/promise-spawn`'s own
   `spawnWithShell()` turns into a literal `child_process.spawn('sh', ['-c',
   '<command line>'], {...})` - confirmed exactly this shape live via the
   error above. Two things are needed to make that actually run something,
   neither of which exists in this runtime yet:
   1. **No dispatch for `sh -c "<line>"` in `spawn()` at all.** `resolveEntryPoint()`
      (`workers/kernel/processClient.ts`) only ever resolves a literal `/bin/
      <command>.js` or a `node <script>` invocation - there is no `sh`/`bash`
      program, vendored or otherwise (`kernel/fs/coreutils.ts`'s own list:
      `echo`, `pwd`, `true`, `false`, `cat`, `ls`, `mkdir`, `rm`, `mv` - no
      shell). This project already has a working, if deliberately minimal,
      shell-line interpreter (`shell/tokenize.ts`'s `&&`/`>`-only tokenizer,
      currently only wired up for `child_process.exec()`/`dwc.shell.exec()`
      via `runShellInternal()`) that could plausibly back a `sh -c` dispatch
      for `spawn()` too - but that path is buffered (accumulates one `output`
      string, returns only at the end), not streamed the way `cp-spawn`'s
      protocol otherwise delivers stdout/stderr progressively; reusing it
      as-is would mean `spawn()`'s streaming contract silently degrades to
      "all output arrives at once, at exit" for anything shell-dispatched.
   2. **No PATH-based executable resolution anywhere in this runtime.**
      Real npm's own `setPATH()` (`@npmcli/run-script/lib/set-path.js`) is
      what's supposed to make `create-vite` (fetched into some real npm cache
      directory, never `/bin/`) resolvable by name inside that `sh -c` line -
      it works by prepending the fetched package's own bin directory onto
      `env.PATH`, then relying on `sh` to search `PATH` for `create-vite` when
      resolving the command word. `resolveEntryPoint()` has no notion of
      `PATH` at all - it is hardcoded to exactly `/bin/<command>.js`, nothing
      else, ever. Even with (1) fixed, `create-vite` would still resolve to
      "command not found" without this.

   **Follow-up, same session: built both, then found and fixed two more real
   bugs live-testing them - `npm create vite@latest` now works completely,
   end to end, for the first time.**

   1. **`resolveEntryPoint()` now does a real PATH search.** Given an `env`
      parameter, a bare command word that isn't `/bin/<name>.js` now searches
      each `env.PATH.split(':')` directory in order (first match wins,
      matching POSIX `execvp`) before giving up - threaded through from every
      call site that has a real `env` available (`cp-spawn`, `execFileSync`'s
      kernel-side backer). A resolved candidate is then run through a new
      `resolveRealEntryPath()` helper (`fsClient.request({action:
      "realpath", ...})`, already a supported VFS op, just never called from
      here before) before being used as an entryPath - real npm's own bin-
      linking creates `node_modules/.bin/<name>` as a genuine symlink into
      the package's own directory, and real Node's module resolution uses
      the symlink's REAL target directory (not the symlink's own location)
      as the base for that module's relative `require()`s. Skipping this
      step is exactly what the second bug below surfaced as - a resolved
      but wrongly-based entry point, not a resolution failure.
   2. **`child_process.spawn()` now has a real `sh -c "<line>"` dispatch
      path.** A new `runShellLineStreamed()` (`workers/kernel/
      processClient.ts`) reuses the exact same `shell/tokenize.ts`
      interpreter `runShellInternal`/`cp-exec` already use, but relays each
      resulting command's stdout/stderr AS PRODUCED via the same streaming
      `bootProcess()`/`cp-event` machinery an ordinary `cp-spawn` uses,
      instead of `runShellInternal`'s buffered single-string-then-return
      shape - matching `spawn()`'s real streaming contract, which real npm's
      own promise-based consumers (`@npmcli/promise-spawn`) actually rely
      on. `cp-spawn`'s handler now special-cases `command === "sh" &&
      args[0] === "-c"` (real npm's own `@npmcli/run-script` always spawns
      scripts, including `npm exec`/`npx`'s fetched-package launch, exactly
      this way) and dispatches here instead of the normal single-
      resolveEntryPoint-then-bootProcess path. A command with a `>` redirect
      still goes through the older buffered `runProgramViaShell` (streaming
      stdout while redirecting it to a file doesn't make sense), now also
      given `env` for the same PATH-search reason.
   3. **A missing default `PATH` silently made (1) a no-op.** Real npm's own
      `setPATH()` (`@npmcli/run-script/lib/set-path.js`) only ever UPDATES an
      existing PATH-shaped key in the env object it's given - it never adds
      one from scratch. This runtime's guest `process.env` had no `PATH` key
      at all by default (never needed before - `resolveEntryPoint`'s
      original `/bin/<name>.js` lookup is PATH-independent), so that update
      was silently a no-op and (1) never had anything to search. Fixed with
      a real, minimal default (`PATH: "/bin"`) in `apis/Process.ts`'s own
      `spawn()`, overridable by a caller's own `options.env.PATH` - confirmed
      live via a temporary diagnostic (`PATH= undefined` before this fix).
   4. **`fs.copyFileSync` didn't exist at all.** Found live, past both bugs
      above: real `create-vite`'s own scaffolding step (copying a template's
      static files into the target directory) calls it directly - `TypeError:
      t.copyFileSync is not a function`. Added as a straightforward
      `readFileSync`+`writeFileSync` composition in `runtime/builtins/fs.ts`
      (single-file copy only - no traced need yet for `fs.cpSync`'s
      recursive-tree form).

   **Verified live, full end-to-end run** (`npm create vite@latest my-app --
   --template vanilla`, same harness as every other entry in this section):
   exit code 0, and `/my-app` now contains real, correct scaffolded output -
   `.gitignore`, `index.html`, `package.json`, `public/`, `src/{assets,
   counter.js, main.js, style.css}` - the actual real-vite `vanilla` template,
   not an empty directory. This is the first time `npm create`/`npx` has
   worked completely in this runtime. The four bugs above were found and
   fixed in sequence, each live run's own error message pointing at exactly
   the next one - `sh: command not found` → `create-vite: command not found`
   (missing default PATH) → `Cannot find module './dist/index.js' from
   .../node_modules/.bin/create-vite` (symlink realpath) → `TypeError:
   t.copyFileSync is not a function` → real success.

## 7. Real vite dev server actually starts — MAJOR MILESTONE (new session)

Continuing right where item 3 left off, now that scaffolding works: ran
`npm create vite@latest` → `npm install` → `npm run dev` end-to-end, in
`examples/playground`, repeatedly, fixing whatever broke next (same method
as everywhere else in this file). Three more real, previously-unknown
runtime gaps, each confirmed by getting the dev server further before
hitting the next one - all found via `dwc.process.spawn()`'s own stdout/
stderr, decoded from `window.__fullLog` chunks the way earlier debugging
in this file used direct diagnostics (huge single console.log calls choke
an automated console reader - the terminal's xterm DOM also only ever
holds the visible viewport, not full scrollback, so neither was usable for
a 40-150MB error dump on its own):

1. **`readdirSync` ignored `{ withFileTypes: true }` entirely**, always
   returning bare filename strings - real Vite's own filesystem walk calls
   `readdir(dir, { withFileTypes: true })` then `dirent.isSymbolicLink()`
   on each entry, crashing on startup with "dirent.isSymbolicLink is not a
   function" (a string has no such method). Fixed via `lstat` per entry
   (no cheaper way to get a type from one `readdir` round-trip in this
   VFS); threaded through the sync, callback, and `fs/promises` forms.
2. **`crypto.hash()` didn't exist** - real rolldown/vite's own `getHash()`
   helper calls this synchronous one-shot form directly (not
   `createHash().update().digest()`) to fingerprint a module's source for
   its dependency-optimizer cache. Added as a thin wrapper over the
   already-real `createHash`.
3. **`fs.watch()` didn't exist at all** - real Vite's own config/dependency
   watcher (chokidar's fallback `createFsWatchInstance`) calls it at
   *startup*, not only for live-reload. This VFS has no push-based change-
   notification mechanism (every fs op is a synchronous request/response
   round-trip), so the implementation deliberately doesn't detect real
   changes - same "exists and is callable, doesn't fake infrastructure
   this runtime doesn't have" precedent as `vm.runInNewContext`/
   `worker_threads.Worker` elsewhere. Real hot-reload-on-change remains
   the separately-tracked open design question (item 4 above).

All three: unit tested, `tsc --noEmit` clean, committed, pushed.

**After all three: real Vite's dev server, backed by the real rolldown
WASM/WASI fallback chain (item 3's own `execFileSync`+pnpm-shim+WASI
work), successfully printed its own real startup banner and reached the
point of calling `dwc.preview.enable()` - i.e. it actually started.** This
is the first time in this project's history a real, unmodified `npm run
dev` (Vite, via rolldown) has booted successfully inside the sandbox, not
just resolved its dependency graph or gotten past an import error.

**What's NOT yet confirmed: whether the guest server actually accepted a
connection.** The preview iframe (and a plain direct `fetch()` to the same
`__dwc_preview__` URL, same result) showed `dwc preview relay error: ...
nothing is listening on port 5173` - the exact same failure mode section 0
above investigated at length for the docs site's own Playground demo, and
concluded (there, independently reconfirmed by another session's 23/23
clean retest) was a Service-Worker/browser-profile-state artifact from
repeated test churn, not a code defect. This session's own test tab had
already undergone several reloads and one memory-pressure crash (from
buffering ~150MB of decoded error text into a plain JS array while
debugging bug #1 above - don't do that; read `window.__fullLog` in small
slices instead) by the time this specific run happened, so the same
profile-state explanation is the leading one here too, but this specific
combination (npm's own child-process spawn chain → real vite → real
rolldown-over-WASI → the preview relay) has NOT been separately re-tested
in a clean profile the way the docs-site case was. That is the concrete
next step - not assumed, since this is a materially different call path
than the docs site's.

**If picking this up:** re-run the same `npm create vite` → `npm install`
→ `npm run dev` cycle in a genuinely fresh Chrome profile/incognito
window (each full cycle takes several real minutes - two real npm-registry
installs, one of them the WASM binding package). Watch for the literal
`Local:` string in stdout (confirms Vite's real ready banner was actually
printed - it did appear in the one successful run so far) and then check whether the
preview iframe actually renders the guest server's page. If it does, this
whole thread (items 1, 2, 3, 7) is complete: real npm install, real npm
create, and a real running Vite dev server previewed live, all working
end-to-end for the first time. If the "nothing is listening" error
reproduces there too, that upgrades it from "probably a testing artifact"
to "a real bug in this specific call path" and warrants the same kind of
direct-fetch-vs-SW-relay diagnostic section 0 used (expose the `dwc`
instance, call `dwc.preview.fetch(port, path)` directly to check whether
the *kernel* thinks something is listening, independent of the Service
Worker relay - that's the fastest way to tell which side is actually
wrong). HMR (item 4) is still a wholly separate, unstarted question even
once this is resolved - what's being verified here is a working `vite
dev`, not live-reload-on-edit.

## 8. `npm run dev` preview failure is real, not a profile artifact — root-caused down to vite's own process exiting after `listen()`

Picked item 7 back up on a new device. The very first direct-fetch check
(`dwc.preview.fetch(5173, '/')`, bypassing the Service Worker relay
entirely) **also** failed with `nothing is listening on port 5173` - the
same kernel-level check that always succeeded in section 0's docs-site
investigation. That result alone disproves the "same as the docs site,
probably a profile artifact" theory this file previously recorded for this
call path: the kernel genuinely has no listener registered, so this isn't
a Service-Worker-relay-only issue at all.

**Root cause, traced end-to-end via live instrumentation (see technique
notes below - all of it was temporary, non-committed debug code, reverted
before this section was written):**

1. `examples/playground/src/main.ts`'s own `waitForMarker()` helper has a
   real bug, found first: it resolves as soon as the stream closes (EOF),
   not only when the marker text (`"Local:"`) is actually seen. This means
   the demo silently proceeds to `dwc.preview.enable()` regardless of
   whether vite ever actually became ready - "nothing is listening" is the
   *symptom* this masking bug lets through, not the disease. Worth fixing
   before further live debugging of this thread (make the demo visibly
   report "dev server exited before printing Local:" instead of silently
   continuing to the preview step).
2. The real underlying failure: `npm run dev` correctly reaches
   `@npmcli/run-script` → `promiseSpawn` →
   `child_process.spawn('sh', ['-c', 'vite'], { stdio: 'inherit' })` → this
   runtime's own `cp-spawn`/`runShellLineStreamed` dispatch (item 3's
   work) → `resolveEntryPoint` correctly resolves `vite` to
   `/my-app/node_modules/vite/bin/vite.js` → `bootProcess` boots it as a
   real nested process worker. All of this is correct and was verified
   live, hop by hop.
3. **Vite's own process worker genuinely calls the low-level
   `net.Server.listen()` binding on port 5173** - confirmed via three
   `net-pipe-listen` registrations, each carrying `{ port: 5173 }` (ruling
   out a port mismatch - the user's own "maybe it's listening on a
   different port" theory, asked live during this session, is
   **disproven**: it's the right port, every time).
4. **That same process worker then exits cleanly - `postEvent("exit",
   { code: 0 })`, zero stderr, zero thrown error** - shortly after (not
   during a long synchronous block; the whole `execFileSync`+WASI-binding
   load this session originally suspected completes in low single-digit
   seconds even on a cold cache, confirmed by isolated repro below).
5. That clean exit is what npm's own `lib/cli/exit-handler.js:171`
   (`this.#process.exit(exitCode)`) is reacting to - `@npmcli/promise-
   spawn`'s `proc.on('close', ...)` fires with `code: 0`, so
   `run-script`'s own promise resolves successfully, and npm's own CLI
   entry (`await execPromise; return exitHandler.exit()`) calls
   `process.exit(0)` right on schedule. **npm, the kernel's `cp-spawn`
   relay, and the shell dispatch are all faithfully reporting a real,
   premature exit of vite's own process - none of them are the bug.**
6. Vite's own "ready" output (the `VITE vX.X.X ready in Yms` banner, or
   the `➜  Local:   http://localhost:5173/` line every real `vite`
   invocation prints immediately after a successful listen) **never
   appears, in any run.** The process dies with the low-level TCP handle
   already registered as listening but before vite's own higher-level
   "the server is ready" code path ever runs.

**Ruled out, each independently, with a live isolated repro (write a
small script to `/bin/<name>.js`, `dwc.process.spawn()` it directly - much
faster than the full multi-minute `npm create vite` → `npm install` cycle
for testing one hypothesis at a time):**
- **Not the `execFileSync`+pnpm-install-the-WASI-binding step.** Reproduced
  standalone (both a fresh download+install and a cache-hit require of the
  already-installed `/tmp/rolldown-<version>/.../rolldown-binding.wasi.cjs`)
  - both return cleanly and fast, no hang, no partial state.
  Confirmed the currently-installed real `rolldown-binding.wasm32-wasi`
  binding module loads and returns a fully-formed native-binding object
  (`BindingDevEngine`, `startAsyncRuntime`, etc. all present).
- **Not `drain()`'s `DRAIN_GRACE_YIELDS` idle-exit timeout** (the
  mechanism that tears a process down after enough consecutive idle
  macrotask yields with no tracked pending work - see `eventLoop.ts`'s own
  doc comments). Bumped from 20 to 20,000 (1000x) and rebuilt; the failure
  reproduced at the exact same point, meaning it isn't a "ran out of grace
  yields waiting on an untracked native-promise chain" issue.
- **Not an uncaught exception.** `worker.ts`'s `reportUncaught()` always
  writes to stderr and exits with code 1 - this exit is code 0 with zero
  stderr, going through the guest-called `process.exit()` path, not the
  fatal-exception path.
- **Not a kernel-side relay bug.** Every hop of the chain above (`cp-spawn`
  receipt → `resolveEntryPoint` resolution → the three `listen` events →
  the final `exit` event → the relay back to npm's own `child_process`
  `'close'` handler) was individually traced and each is a correct,
  faithful forwarding of what vite's own process worker actually did.
- **Not obviously a missing `eventLoop.ref()` on `net.Server.listen()`**
  either, on inspection: `bindings/net.ts`'s `recount()` function (shared
  by both `TCP.listen()` and `Pipe.listen()`) does correctly call
  `ref()`/`unref()` based on `_live && _refed && !_closed` - a listening,
  non-unref'd handle *should* keep `drain()` from ever concluding "no
  pending work". Given the process still exits, either (a) vite's own code
  explicitly closes/unrefs these three listeners shortly after opening
  them (a "probe the port, then really bind" pattern - plausible, since
  three registrations for the *same* port 5173 is one more than a single
  real bind would produce), or (b) something else entirely is going on
  that hasn't been isolated yet. Not yet distinguished - see next step.

**Update, same investigation, next device: the three `listen` events were
never the real bind at all.** Read real vite's own `dist/node/chunks/
node.js` (`npm pack vite@8.2.2` locally, same technique as below) to find
exactly what runs between `httpServer.listen()` and `printUrls()` -
answering the "next step" question above directly:

- `httpServerStart()` calls `isPortAvailable(port)` **before** ever
  attempting the real bind. `isPortAvailable` probes the port once per
  entry in vite's own `wildcardHosts` Set - which has **exactly three**
  entries (`"0.0.0.0"`, `"::"`, and `"0000:0000:0000:0000:0000:0000:0000:0000"`,
  the same address in two notations - vite doesn't dedupe them). Each
  probe (`tryListen()`) does `net.createServer().listen(port, host)`, then
  **immediately closes it again** the instant `'listening'` fires. **This
  is exactly the three `listen` events traced above - all three are
  probes, all three get closed right away, and none of them is the real,
  lasting server.** The user's own live "maybe it's a different port?"
  question, asked mid-session, prompted re-checking this exact detail -
  confirmed still the right port (5173) throughout, just never the real
  bind.
- Only *after* all three probes report the port free does
  `httpServerStart()` call `tryBindServer()`, which calls
  `httpServer.listen(port, host)` - and vite has **already overridden**
  `httpServer.listen` earlier in `_createServer()` to run its own
  `initServer(true)` first: `await environments.client.pluginContainer
  .buildStart()`, then `await Promise.all(environments.map(e =>
  e.listen(server)))`, and only *then* does it call through to the real,
  original low-level `listen(port, host)`.
- **This means the real bind - and vite's own ready banner - are gated
  behind `pluginContainer.buildStart()`, a call into rolldown's own
  native/WASM machinery. And the process reliably dies during exactly
  that gap: a fourth `listen` event (the real one) never appears, in any
  run.**

**This session's own direct, timed repro of that exact gap** (bypass npm
and the shell dispatch entirely - `dwc.process.spawn('.../vite/bin/
vite.js', { cwd: '/my-app' })` directly, with the three lines above
patched in the guest VFS copy of `node.js` to `console.log(Date.now())`
immediately before/after `buildStart()`, `environments.listen()`, and the
real low-level `listen()` call - see technique notes below):

- Every run logs `[dwctrace] before buildStart <T>` and then **nothing
  else at all** - no `after buildStart`, no `environments.listen`, no
  `REAL low-level listen`, no error, no stderr - before the process exits
  with code 0, **consistently ~8-9.2 seconds later** (8000ms, 8153ms,
  9229ms across three separate runs).
- **That ~8s delay is independent of `drain()`'s own idle-exit grace
  period - the "not `DRAIN_GRACE_YIELDS`" finding above is now proven
  twice over, precisely.** Bumped `DRAIN_GRACE_YIELDS` a second time, this
  time 10,000x (20 → 200,000) with real timestamps on both sides: the
  process still died at the same ~8-9s mark, not later. Whatever's
  happening inside `buildStart()`, the eventLoop's own yield-count budget
  has nothing to do with when it gives up - ruling out "the guest's native
  promise chain just needed a few more yields" as an explanation
  entirely, not just as a guess.
- The ~8-9s isn't obviously a single hardcoded constant in this codebase
  (grepped for `8000`/`_MS`/`_TIMEOUT` project-wide: the closest matches
  are `SYNC_TIMEOUT_MS = 5000` in `syncFsClient.ts` and
  `UNREF_DEBOUNCE_MS = 3000` in `worker_threads.ts` - suggestively close
  to summing to ~8000 if they fired back-to-back, which was the leading
  hypothesis picked up next - but not an exact, reproducible-to-the-ms
  match either, so treat it as a lead, not a conclusion).
- **That specific hypothesis (a synchronous fs call from inside a nested
  `worker_threads.Worker`, as rolldown's own WASI thread pool would use,
  hanging until `SYNC_TIMEOUT_MS` fires) was tested directly and
  disproven**: a minimal repro - `new Worker('/bin/child.js')` where the
  child does a plain `fs.readFileSync()` and posts back - completed in
  under 50ms, no hang, no timeout. Basic worker_threads + sync-fs is fine;
  whatever's actually slow/hanging inside `buildStart()` is something more
  specific than that.

**Concrete next step, in order of cost - the search space is now much
narrower than "somewhere in vite's dev-server startup":**
1. **Find out what `pluginContainer.buildStart()` actually calls.** It's
   real, unmodified vite/rolldown code (`npm pack vite@8.2.2` locally
   already has it) - read `environments.client.pluginContainer
   .buildStart` and whatever plugin hooks it invokes for a bare vanilla
   template (dep optimizer warm-up? a first call into
   `nativeBinding.startAsyncRuntime()` or `BindingDevEngine`? a
   `worker_threads.Worker` spawn for rolldown's own thread pool that looks
   different from the minimal repro above - e.g. spawning *multiple*
   workers, or one that itself calls back into more native code before
   its first message?). The goal is a *specific* call to try in isolation
   the same way the plain-`fs.readFileSync`-in-a-Worker repro was tried.
2. Once the specific slow/hung call is identified, patch temporarily
   *inside its own worker_threads.Worker child script* (if it is one) or
   at the calling site with the same `Date.now()`-timestamped
   `console.log` technique used above, to see exactly where the ~8-9s
   goes: waiting on a message that never arrives, `Atomics.wait` timing
   out, or something else in `worker_threads.ts`'s own `ready`/spawn
   machinery.
3. Once root-caused: fix `waitForMarker()` (item 1 at the top of this
   section) regardless, so future runs surface "vite exited early" as a
   visible, distinct failure instead of silently reaching the preview step
   every time.

**Diagnostic technique notes for whoever picks this up (all learned live
this session, worth keeping in mind before re-inventing them):**
- **`read_console_messages` (browser automation) only reliably captures
  the main page thread's console.** `console.log()` calls from inside a
  nested Worker (the kernel worker, a process worker, etc.) do fire, but
  don't show up through that tool - confirmed by adding logging that
  never appeared no matter how it was searched for, until it was rerouted
  through the existing `cp-event`(kind: `"stdout"`/`"stderr"`) relay
  mechanism (`worker.postMessage({ type: "cp-event", payload: { id, kind:
  "stderr", chunk: ... } })`, using the same request `id` a spawn is
  already tracking, or `onEvent("stderr", { chunk }, "")` inside
  `processClient.ts` functions that already have an `onEvent` in scope) -
  at which point it appeared immediately as ordinary stdout/stderr on
  whatever host-visible process was already being piped.
- **The vendored guest `console.log()` (`worker.ts`) stringifies via
  `args.map(String).join(" ")`** - passing an object logs the useless
  `[object Object]`. Always `JSON.stringify()` first when relaying trace
  data through it or through the `cp-event` stderr channel above.
- **`//# sourceURL=dwc://module<path>` was added to `moduleLoader.ts`'s
  `new Function` compilation this session** (committed separately,
  `4d0f2b6`, kept - not reverted with the rest of this session's debug
  code) - every guest stack trace now names the real vendored file
  instead of `eval at loadModule (...), <anonymous>:N:M`. This is what
  turned an unattributable `process.exit(0)` call into an immediately
  actionable `npm/lib/cli/exit-handler.js:171`, and should make every
  future guest-code debugging session in this runtime faster.
- **A single-file isolated repro is much faster than the full cycle** for
  testing one hypothesis at a time: `dwc.fs.writeFile('/bin/foo.js',
  script)` then `dwc.process.spawn('/bin/foo.js', { argv: [], cwd: '/' })`
  runs in seconds, versus several real minutes for a fresh `npm create
  vite` → `npm install` → `npm run dev` cycle. Also: `dwc.process.spawn`
  (the **host-facing** API) does not support the `command === "node"` +
  script-argv special case guest-side `child_process.spawn()`/shell
  dispatch gets via `resolveEntryPoint` - always give it a real, existing
  file path as `command` directly, not `"node"` as the command with the
  script as an arg.
- **Patching a real npm/dependency file directly inside the guest VFS**
  (read via `dwc.fs.readFile`, string-`replace()` in the browser to avoid
  ever pulling a large file through the agent's own context/hitting the
  browser tool's base64/cookie-like-data output filter, `dwc.fs.writeFile`
  back) is a fast way to add temporary tracing to real vendored dependency
  code (npm itself, `@npmcli/run-script`, `@npmcli/promise-spawn`, the
  real rolldown `dist/shared/binding-*.mjs` fallback) without needing a
  local checkout - `npm pack <pkg>@<version>` into a scratch directory
  gives you the exact same source to diff against/copy patches from
  first. These VFS patches don't persist across a real npm reinstall (this
  demo's own `npm create vite` reinstalls `/my-app` fresh on every page
  reload), so they're inherently throwaway and need no cleanup.

## Reminder: no AI attribution in commits

Per standing preference, commit messages for this project should not
include `Co-Authored-By`/session-link footers.
