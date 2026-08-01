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

### Default (unset) resolves to `"automated-testing"`
**(Originally `"real"` — renamed, see the "permanent stable sample event"
decision below.)**
**Why:** Zero-config parity with pre-existing behavior; `pnpm dev`/`build`/
`preview`/`test:e2e` keep working unmodified with no env var set.

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

### `content/automated-testing/pages/index.md` no longer hardcodes `content/pages/`
**Why:** The path is now set-dependent; wording generalized to "this content
set's `pages/` directory" so it's correct regardless of which set is active.

## Decisions (continued)

### Default content set is configurable via `content/config.yaml`
**Why:** See `docs/design/content-config.md` for the full design — the
short version is that the hardcoded default fallback became
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
**(Superseded — see `docs/design/content-config.md`'s "manifest.webmanifest
is generated" decision: once distinct per-set `name`/`short_name`/icons
were needed, a single shared static file could no longer work regardless of
its URLs being relative, and `public/` itself was retired.)**
**Why (at the time):** `id`/`start_url`/`scope`/icon `src` values changed
from root-absolute (`/`, `/icons/...`) to relative (`.`, `icons/...`). Per
the Web App Manifest spec, relative URLs resolve against the manifest's own
URL, so one static file (copied verbatim into every build via Vite's
public dir) worked correctly whether served from `/`, `/real/`, or
`/test/`, with no per-set templating step. `id: "."` specifically mattered
so the root/`/real/`/`/test/` deploys registered as distinct installable
PWA identities instead of colliding on a shared `id: "/"` — that part of
the reasoning still holds and carried over to the generated manifest.

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

### `content/real/` renamed to `content/automated-testing/` — enshrined as a permanent stable sample event, not treated as actual production data
**Why:** `real` originally meant "the actual production content set," but
in practice it held a realistic-but-generic convention's data (Montreal
Mix 2026) with no real deploy target of its own — and both unit tests
(`src/App.test.tsx`) and most of `e2e/`'s coverage (`e2e/app.spec.ts`,
`e2e/dance-schedule.spec.ts`) asserted directly against its exact content
(specific caller names, session details, page copy), since `pnpm dev`/
`build`/`test:e2e` all defaulted to it with no env var set. That coupling
is a problem the moment this set's content is ever actually swapped in for
a genuine, one-off real event — tests would either break on every content
edit or (worse) silently stop testing what they claim to. Renaming to
`automated-testing` and keeping its content fixed makes that coupling
*intentional and permanent* instead of accidental: it's a stable,
narratively-coherent sample event that both unit and e2e tests are meant
to assert against directly, distinct from `test`'s role as a deliberately
edge-case/format-coverage fixture (parsing corner cases, not a coherent
event). `content/config.yaml`'s `defaultContentSet` stays pointed at
`automated-testing` for now, so `pnpm dev`/`build`/`test:e2e` keep working
unmodified with no env var — there's no other real event to default to
yet.

**How a genuine first real event gets added:** per
`docs/adding-a-new-event.md`, clone `content/automated-testing/` into a
new, appropriately-named directory (e.g. `content/spring-2027/`) as a
starting template, then repoint `content/config.yaml`'s
`defaultContentSet` at the new set. `automated-testing` itself is never
edited to reflect a real event's actual details — it stays the fixed
sample/test fixture indefinitely.

**This has since happened** — `content/config.yaml`'s `defaultContentSet`
no longer points at `automated-testing` (check that file for the current
value). `pnpm dev`/`build` unmodified now default to the real event instead,
same as any future repoint. `pnpm test`/`test:watch` were updated to pin
`CONTENT_SET=automated-testing` explicitly once this stopped being the
default (previously true "with no env var" only because it happened to be
the default at the time), and `pnpm test:e2e`'s specs already navigated to
`/automated-testing/`-prefixed URLs directly rather than relying on the
unprefixed default, so that layer needed no change at all.

**`pnpm test`/`test:watch` pin `CONTENT_SET=automated-testing` explicitly**
(`package.json`) — the rename above declares the intent, but `CONTENT_SET`
unset still falls back to whatever `content/config.yaml`'s
`defaultContentSet` currently is (see `vite.config.ts`). Once a real
event's `content/<name>/` became the actual default (repointing that
file, as above), unit tests hardcoding assertions against
`automated-testing`'s content (`src/App.test.tsx`, `src/components/
Nav.test.tsx`, `src/hooks/useLastPagePersistence.test.tsx`) started
silently rendering the *new* default's content instead and failing —
confirmed exactly this happened the moment `backtrack2abq` became the
default. Pinning the env var in both test scripts (matching the existing
`dev:test`/`build:test` pattern) keeps `pnpm test` asserting against the
stable sample regardless of which set is live in production.

### Root/default-mirrored build's service worker excludes sibling content sets via `navigateFallbackDenylist`
**Why:** The default set is mirrored unprefixed at `/`, so that build's
service worker registers with scope `/` — a superset of every other
content set's own `/<set>/` scope. Uncustomized, its `navigateFallback`
acts as a catch-all for *any* unmatched navigation within scope `/`,
including `/backtrack2abq/...`, `/test/...`, etc. — so any visitor who's
ever loaded the bare domain in a given browser gets permanently shadowed
onto the default set's cached shell for every other event too, silently
(confirmed empirically: reproduces in a normal tab with a pre-registered
root SW, but not a fresh/private one, since there's nothing there yet to
do the shadowing — server-side/Amplify routing is unaffected either way).
`vite.config.ts` now sets `workbox.navigateFallbackDenylist` to every
sibling set's prefix (via `listContentSets`), but only for the root build
(`BASE_PATH === '/'`) — excluded navigations fall through to the existing
NetworkFirst `runtimeCaching` rule instead, which correctly reaches the
network. Non-root builds don't need this: a service worker scoped to
`/backtrack2abq/` can't shadow `/test/` in the first place.

### An `/events` landing page lists every published set, linking to each one's home page
**Why:** Every set publishes independently, but nothing previously listed
them all for a real visitor — only the internal `/debug/dance-schedule`
page enumerated sets at all (unstyled developer tooling, not meant for real
users). `src/components/EventsListPage.tsx`, routed at `/events`
(`src/App.tsx`, added the same "outside `~react-pages`, reachable but never
in `Nav`" way as `debugRoutes`/`utilityRoutes` — subtle by design, reached
via a link `BuildInfo.tsx` adds right after the build date, not a primary
nav destination), reads the same `virtual:content-sets` module the debug
page already used, now enriched with per-set `displayName`/`testFixture`
(see `docs/design/content-config.md`'s `testFixture` decision). Sorted via
`src/lib/sortContentSets.ts` — real events alphabetically first, then
test-fixture sets alphabetically. `'events'` was added to
`scripts/build-content-sets.mjs`'s `RESERVED_NAMES` alongside `debug`/
`clear-storage`, for the same reason those are there: a future content set
literally named `events` would produce a real `dist/events/index.html` that
permanently shadows this hardcoded route.

Each entry links via a plain `<a href="/<set>/">`, not a `react-router`
`Link` — same reasoning as the debug page's existing cross-set links:
crossing to another content set is a full separate app/build (a real page
navigation, not a client-side route change), and only a set's home page is
guaranteed to resolve without an extra per-set Amplify rewrite rule
(`docs/design/hosting.md`). The two *within-build* discovery links this
same change adds (`BuildInfo.tsx`'s link to `/events`; `DanceSchedulePage.tsx`'s
link to `/debug/dance-schedule`) are the opposite case — real `react-router`
`<Link>`s, since both targets are routes within the *current* build, and
`App.tsx`'s `<BrowserRouter basename={import.meta.env.BASE_URL}>` already
makes those resolve correctly under whichever prefix that build is served
at, with no manual path-prefixing needed.

## Open questions

- Content-set names are not currently checked against a reserved list
  beyond a small hardcoded set in `scripts/build-content-sets.mjs`
  (`assets`, `icons`, `index.html`, `manifest.webmanifest`, `sw.js`,
  `debug`, `clear-storage`, `events`, `workbox-*`) — a set colliding with
  one of these fails the build loudly, but the check is manual/hardcoded
  rather than derived from Vite's actual build output.
- Direct/deep-link navigation into a prefixed set (e.g. a bookmark or
  shared link to `/automated-testing/installation`) needs server-side SPA-fallback
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
