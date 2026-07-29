# Content sets

## Context

The app originally had exactly one schedule/dance-schedule data source
(`data/*.xlsx`) and one set of content pages (`content/pages/`). Two new
needs arose together: a genuinely independent test fixture (distinct
schedule data *and* distinct content pages, not a placeholder) to develop
and verify against without touching real data; and support for **several
real events under development concurrently** (not just "real" vs. "test").
Both needs are the same underlying problem — the app needs to be pointed at
one of several self-contained bundles of pages + data, chosen at build time.

## Sub-problems

- [x] Where should per-event content (pages + data) live, given multiple
      concurrent real events need to coexist — see Decisions
- [x] How is the active content set selected — see Decisions
- [x] Default/unset behavior and script ergonomics for the always-present
      "real" and "test" sets — see Decisions
- [x] How is a genuinely independent test fixture authored, given the two
      data files are binary spreadsheets — see Decisions
- [x] Do the schedule/dance-schedule Vite plugins need an API change — see
      Decisions
- [x] Impact on existing e2e tests, which assert on real-data strings — see
      Decisions

## Decisions

### Folder-per-content-set under `content/<set>/{pages,data}/`
**Why:** Generalizes beyond a fixed "real"/"test" pair to any number of
concurrently-in-development real events (e.g. `content/spring-2027/`,
`content/fall-convention/`), each fully self-contained (own markdown pages +
assets, own `event-schedule.xlsx`/`dance-schedule.xlsx`/dump). Rejected
alternative: keep `data/` at the repo root with a suffix-based naming scheme
(`data/event-schedule.test.xlsx`) — doesn't generalize to N sets, and splits
content across two top-level trees that would each need their own switching
logic.

### `CONTENT_SET` env var, read directly via `process.env.CONTENT_SET`
**Why:** This repo has no `.env`-file convention (no `loadEnv`/
`import.meta.env`/`dotenv` usage anywhere), and this is a build-time,
Node-context-only switch that must never reach the client bundle —
consistent with the schedule pipeline's existing rule that raw spreadsheet
data is never shipped to the client. `process.env` is populated before
`vite.config.ts`'s top-level code runs (the same timing already relied on
for `BUILD_NUMBER`'s `execSync` call), so no `defineConfig((env) => ...)`
factory form is needed. Rejected alternative: Vite's built-in `--mode` —
conflates content-set selection with Vite's own dev/prod mode concept.

### Default (unset) resolves to `"real"`
**Why:** Zero-config parity with pre-existing behavior; `pnpm dev`/`build`/
`preview`/`test:e2e` and their assertions against real content keep working
unmodified.

### Dedicated `pnpm` scripts only for `test`; other sets used via the raw env var
**Why:** `test` is a permanent, always-present fixture worth a discoverable
shortcut (`dev:test`, `build:test`). A real event's set name is unpredictable
and short-lived — a dedicated script per event would need constant addition/
removal for no ergonomic gain over `CONTENT_SET=<name> pnpm dev`.

### No `preview:test`
**Why:** `vite preview` only serves the already-built `dist/`; it never
reads `CONTENT_SET`. A dedicated script would be identical to plain
`pnpm preview` and would misleadingly imply it re-selects a content set. The
flow is `pnpm build:test && pnpm preview` (two commands).

### No runtime switching — build-time only
**Why:** Matches the existing "editing the spreadsheet requires a rebuild"
model. Runtime switching would mean either shipping every content set's data
to the client (breaks the "never shipped to the client" property) or a
server component this static PWA doesn't have.

### `schedulePlugin`/`danceSchedulePlugin` take a `dataDir` option
**Why:** Minimal-diff parameterization — internal parsing/error/dev-watch
logic is untouched; only how the source-file path is computed changes.

### Test fixture generated via a temporary dependency, not committed
**Why:** `.xlsx` is a binary format; hand-authoring isn't practical, and a
permanent xlsx-writing dependency doesn't pull its weight for a one-time
fixture-generation task. A one-off script (`scratch/generate-test-content-set.mjs`,
kept for reproducibility) using a temporarily `pnpm add -D`'d writer library
(`exceljs`), removed immediately after, produces committed binary output
with zero permanent dependency footprint. The generated fixture was
validated by running it through the real parsing pipeline (`pnpm build:test`)
rather than reimplementing validation in the generation script.

### `content/real/pages/index.md` no longer hardcodes `content/pages/`
**Why:** The path is now set-dependent; wording generalized to "this content
set's `pages/` directory" so it's correct regardless of which set is active.

## Decisions (continued)

### Default content set is configurable via `content/config.yaml`
**Why:** See `docs/design/content-config.md` for the full design — the
short version is that the hardcoded `'real'` fallback became
`content/config.yaml`'s `defaultContentSet`, validated against a real
`content/<name>/` directory at build time (closing the "validate the
target directory exists" open question below for both the config-file
default and an explicit `CONTENT_SET` env override).

## Decisions (continued)

### Every content set publishes at once, not just one chosen at build time
**Why:** The original framing ("point the app at one of several bundles,
chosen at build time") only fit while exactly one set needed to be *live*
at a time. Once multiple real events are concurrently in development,
each needs its own reachable, linkable URL rather than requiring a
redeploy to switch which one is visible. `CONTENT_SET`/`BASE_PATH` are
still resolved once per Vite process — that constraint didn't change — so
"publish all sets" is implemented as **N+1 separate `vite build`
invocations** (one per `content/<set>/`, each producing its own
self-contained bundle/service-worker/manifest under a `/<set>/` URL
prefix, plus one extra build for `content/config.yaml`'s
`defaultContentSet` mirrored unprefixed at `/`), orchestrated by
`scripts/build-content-sets.mjs` and merged into one `dist/` tree via a
build-to-temp-dir-then-atomic-rename swap (so `dist/` is never left
partially published if one of the N+1 builds fails). `pnpm build` now runs
this orchestrator; `pnpm dev`/`dev:test`/`build:test`/`preview` are
unchanged — they still serve/build exactly one set, unprefixed, for fast
local iteration.

### `BASE_PATH` env var drives `base`, `import.meta.env.BASE_URL` drives the router `basename`
**Why:** Each of the N+1 builds needs its asset URLs, service worker
scope, and client-side routing to agree on the same prefix. Vite's own
`base` config option already does this consistently for asset URLs, the
generated service worker's scope, and `import.meta.env.BASE_URL` — so
`src/App.tsx`'s `<BrowserRouter basename={import.meta.env.BASE_URL}>` is
the only client-code change needed; no custom runtime prefix-detection
was written.

### `public/manifest.webmanifest` uses relative URLs, not per-set generated manifests
**Why:** `id`/`start_url`/`scope`/icon `src` values changed from
root-absolute (`/`, `/icons/...`) to relative (`.`, `icons/...`). Per the
Web App Manifest spec, relative URLs resolve against the manifest's own
URL, so one static file (copied verbatim into every build via Vite's
public dir) works correctly whether served from `/`, `/real/`, or
`/test/`, with no per-set templating step. `id: "."` specifically matters
so the root/`/real/`/`/test/` deploys register as distinct installable PWA
identities instead of colliding on a shared `id: "/"`.

### `vite.config.ts`'s `workbox.navigateFallback` no longer overridden to an absolute path
**Why:** The prior `navigateFallback: '/index.html'` was harmless while
`base` was always `/`. Once `base` varies per build, an absolute fallback
would serve the *default* set's root `index.html` for offline navigations
inside a prefixed set's scope (e.g. `/test/`) — wrong bundle. Removed in
favor of `vite-plugin-pwa`'s own default (`'index.html'`, relative),
which resolves correctly against each build's own `base`/scope.

### `listContentSets`/`virtual:content-sets` resolve the discoverability open question
**Why:** `content-config.ts`'s `listContentSets(root)` lists `content/*`
directories, consumed both by `scripts/build-content-sets.mjs` (to decide
what to build) and by a new `vite-plugin-content-sets.ts` exposing
`virtual:content-sets` (`{ sets, defaultSet, activeSet }`) to client code —
used by the debug page's cross-set links
(`src/components/RawDanceScheduleDebugPage.tsx`) so published sets are no
longer purely tribal knowledge (`CONTENT_SET=<name>`) but discoverable
from within the running app.

## Open questions

- Content-set names are not currently checked against a reserved list
  beyond a small hardcoded set in `scripts/build-content-sets.mjs`
  (`assets`, `icons`, `index.html`, `manifest.webmanifest`, `sw.js`,
  `workbox-*`) — a set colliding with one of these fails the build loudly,
  but the check is manual/hardcoded rather than derived from Vite's actual
  build output.
- All published sets currently share one `manifest.webmanifest` verbatim,
  so installed home-screen icons for different content sets look
  identical (same name/short_name/icons). Differentiating them (e.g. "Dance
  Schedule (Test)") would need per-build manifest templating instead of one
  static file — deferred; will need solving before multiple sets are
  regularly installed side-by-side as PWAs.
- Direct/deep-link navigation into a prefixed set (e.g. a bookmark or
  shared link to `/real/installation`) needs server-side SPA-fallback
  rewrite rules aware of each prefix — see `docs/design/hosting.md`'s new
  decision on this; it's Amplify console config, not something `vite
  preview` reproduces locally either.
- ~~Should content-set resolution validate the target directory exists (at
  `configResolved`/`load()` time) and fail with a friendly named error
  ("content set 'xyz' not found — expected content/xyz/ to exist"), rather
  than whatever raw ENOENT `vite-plugin-pages`/`read-excel-file` currently
  produce for a missing dir/file?~~ Resolved — see Decisions above.
- Should `test` get its own Playwright e2e coverage (a second `webServer`/
  project running `CONTENT_SET=test`), now that its data is deliberately
  edge-case-rich, or stay a manual/dev-time tool for now?
- Should a content set be allowed to omit `dance-schedule.xlsx` (only ship
  the simple schedule)? Today both plugins unconditionally expect their file
  to exist.
