# Cross-content-set events landing page, plus two subtle discovery links

## Context

Every content set (event) publishes independently at its own `/<set>/`
prefix, and the default set additionally mirrors unprefixed at `/` (see
`docs/design/content-sets.md`) — but nothing lists *all* published sets for
a visitor. The only place that currently enumerates sets at all is the
`/debug/dance-schedule` developer page, which is explicitly unstyled/
internal (a dense debug table) and not meant for real users. This adds a
genuine, user-facing "all events" page, reachable via a subtle link near the
build-date footer (not a nav entry — same "reachable but not in nav"
treatment already used for `/debug/*` and `/clear-storage`), plus a second
subtle link from the Dance Schedule page to its own existing debug/dump
view, so a viewer already on an event's schedule can jump straight to the
raw data behind it.

## Key design decisions

**No single Vite build can see another content set's actual content**
(pages/data) — each `vite build` is scoped to one `CONTENT_SET`/`BASE_PATH`
pair (`vite.config.ts`). But `virtual:content-sets`
(`vite-plugin-content-sets.ts`) already gives every build the full list of
`content/<name>/` directories via `listContentSets()` (a cheap filesystem
`readdirSync`, no content parsing) — the same mechanism the debug page
already uses for its own cross-set links. This is the right place to hang
the landing page's data too: extend that virtual module's payload from bare
directory names to include each set's display name and whether it's a test
fixture, both read from `content/<set>/config.yaml` (also a cheap read,
already done elsewhere per-set via `loadContentManifestStrings`) — no
architecture change, no build-orchestrator changes.

**"Test event" gets an explicit config flag, not a hardcoded name check.**
Today "automated-testing"/"test" are special only by convention/naming,
documented but not machine-readable. Hardcoding those two literal names in
the sort logic would work today but silently misclassifies any future
differently-named fixture set. Adding one new optional per-set config key
(`testFixture: true`, defaulting to `false`) is a small, additive schema
change in the same file that already has `features:`/`manifest:` sections,
and is genuinely more correct.

**The landing page's per-event links are plain `<a href="/<set>/">`, not
`react-router` `Link`s** — mirroring the debug page's existing, deliberate
choice: crossing to another content set is a full separate app/build (a
real page navigation), and only each set's home page is guaranteed to
resolve correctly without extra hosting config (a deep link needs a
per-set Amplify rewrite rule not yet in place — see
`docs/design/hosting.md`). This matches the request exactly ("hyperlink to
the event home page").

**The two new *discovery* links (landing page ← build date, debug dump ←
Dance Schedule page) are same-build, same-app navigations**, so they use
real `react-router` `<Link>`s to basename-relative paths (`/events`,
`/debug/dance-schedule`) — confirmed via `App.tsx`'s
`<BrowserRouter basename={import.meta.env.BASE_URL}>`, so these resolve
correctly under whichever prefix the current build is served at, with no
manual prefixing needed.

**Route path: `/events`**, added to `App.tsx` exactly like `debugRoutes`/
`utilityRoutes` (outside `~react-pages`, so `Nav.tsx` never lists it — this
*is* the "subtle" treatment: reachable by URL and by the new footer link,
never a permanent nav item). Also added to `scripts/build-content-sets.mjs`'s
`RESERVED_NAMES` (alongside `debug`/`clear-storage`) so a future content set
can never be named `events` and collide with this route.

**Test the sort logic as a plain lib function, not the page component.**
Grepped the repo: no test file exists for `RawDanceScheduleDebugPage.tsx`
or `DanceSchedulePage.tsx` — the established pattern here is that a page
component wired directly to a `virtual:*` module doesn't get its own test;
the logic worth testing gets extracted into a plain function first. Same
approach here: sorting/grouping lives in a small `src/lib/sortContentSets.ts`
with a real colocated unit test; `EventsListPage.tsx` itself stays a thin,
untested-by-convention wrapper, verified live instead.

## Implementation

### `content-config.ts`
Add `isTestFixtureContentSet(root, contentDir): boolean` — sibling to
`loadContentManifestStrings`, same shape (reads `content/<set>/config.yaml`,
missing file/key → `false`). New optional top-level YAML key `testFixture`.

### `content/automated-testing/config.yaml`, `content/test/config.yaml`
Add `testFixture: true` to each (the only two sets that should sort last).
`content/backtrack2abq/config.yaml` needs no change (defaults to `false`).

### `src/types/contentSets.ts`
Change `ContentSetsData.sets` from `string[]` to an array of:
```ts
export interface ContentSetInfo {
  name: string // content/<name>/ directory name — used for the /<name>/ href
  displayName: string // manifest.name, falls back same as everywhere else
  testFixture: boolean
}
```

### `vite-plugin-content-sets.ts`
In `load()`, build `sets` by mapping `listContentSets(root)` through
`loadContentManifestStrings(root, \`content/${name}\`)` and
`isTestFixtureContentSet(root, \`content/${name}\`)` into `ContentSetInfo[]`.
`configurePreviewServer`'s middleware is untouched — it only needs bare
directory names, still gets them from `listContentSets(root)` directly.

### `src/components/RawDanceScheduleDebugPage.tsx`
Only existing consumer of `contentSets.sets` — update the `.map` to read
`set.name`/`set.displayName` (displayed name can stay as the raw name here,
this page is developer tooling, not the new user-facing list) instead of
treating each entry as a bare string.

### `src/lib/sortContentSets.ts` (+ colocated test)
`sortContentSets(sets: ContentSetInfo[]): ContentSetInfo[]` — real
(`testFixture === false`) entries first sorted alphabetically by
`displayName`, then test-fixture entries sorted alphabetically by
`displayName`. Table-driven unit test covering: mixed real/test sets sort
test-last; alphabetic within each group; empty input.

### `src/components/EventsListPage.tsx` (+ `.module.css`)
New page: `<PageHeader title="All Events" />`, then a `<ul>` of
`sortContentSets(contentSets.sets)`, each item a plain `<a href={`/${set.name}/`}>{set.displayName}</a>`. Test-fixture entries get a small muted
"(test)" suffix so the grouping is self-evident, not just an invisible sort
order — small `.module.css` for that muted styling (mirrors `BuildInfo`'s
existing `#888`/`0.75rem` treatment for similarly low-emphasis text).

### `src/App.tsx`
Add `{ path: '/events', element: <EventsListPage /> }` to the same array
`debugRoutes`/`utilityRoutes` already populate (or a new sibling array —
whichever reads more clearly once written) passed into `useRoutes`.

### `src/components/BuildInfo.tsx` (+ `.module.css`)
Add a `react-router` `<Link to="/events">` immediately after the existing
build/compiled text, inside the same `<p>`, using the file's existing
" · " separator convention between the two pieces of text already there.
Since `BuildInfo` is shared and route-agnostic (per its own doc comment),
this automatically covers both places it renders today: the home page
footer (`HomeBuildInfo` in `App.tsx`) and the debug page.

### `src/components/DanceSchedulePage.tsx` (+ new `.module.css`)
Add a small, subtly-styled `react-router` `<Link to="/debug/dance-schedule">`
(e.g. "View raw debug data") right after `<PageHeader title="Dance Schedule" />`.
This page's data (`virtual:dance-schedule`) is exactly what the debug page
renders, and it's the only page in the app with a matching debug/dump view
(confirmed: no `event-schedule-dump.md`/debug view exists for the separate
"Event Schedule" page, `SchedulePage.tsx`) — scoped to this one page only,
not also added to the level-columns view (`DanceScheduleLevelsPage.tsx`),
since that's a second view of the identical underlying data and the request
was for one link to "the current event"'s debug/dump, not every page that
happens to touch that dataset.

### `scripts/build-content-sets.mjs`
Add `'events'` to `RESERVED_NAMES`.

### Docs
- `docs/design/content-config.md` — document the new `testFixture` key
  alongside the existing `features`/`manifest` schema description.
- `docs/adding-a-new-event.md` — per CLAUDE.md, this schema-detail guide
  must stay in sync; add a brief note in its Step 2 section that
  `testFixture` exists but is for internal fixture sets only ("you won't
  need this for a real event") so it doesn't confuse someone following the
  walkthrough.
- `docs/design/content-sets.md` — add a short decision entry: the new
  `/events` landing page, why `virtual:content-sets` (not the build
  orchestrator) is the right place for cross-set awareness, and why its
  links are plain `<a>` tags to each set's home page only.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` — includes the new
  `sortContentSets.test.ts` and updated `content-config.test.ts`.
- `pnpm build` (production, builds every content set) then `pnpm preview`:
  visit `/events` and confirm every published set is listed, real events
  alphabetical, `automated-testing`/`test` both last and alphabetical
  between themselves, each link actually navigates to that set's real home
  page. Confirm the same `/events` page (and its data) looks correct when
  reached via more than one set's own prefix (e.g. `/backtrack2abq/events`
  and the unprefixed default-mirror `/events`), since each build embeds its
  own copy of the same cross-set list.
- Visually confirm (`pnpm dev` is enough for this part, single-set): the
  "All events" link appears immediately after the build date text on the
  home page footer and on `/debug/dance-schedule`; the new debug-dump link
  appears on `/dance-schedule` (not `/dance-by-level`) and correctly
  navigates to `/debug/dance-schedule`.
- Confirm via claude-in-chrome screenshots on both the home page and the
  new `/events` page; check console for errors.

## Critical files

- `content-config.ts` — new `isTestFixtureContentSet`
- `content/automated-testing/config.yaml`, `content/test/config.yaml` — add `testFixture: true`
- `src/types/contentSets.ts` — `ContentSetInfo` shape
- `vite-plugin-content-sets.ts` — enrich `virtual:content-sets` payload
- `src/components/RawDanceScheduleDebugPage.tsx` — update to new `sets` shape
- `src/lib/sortContentSets.ts` (+ test) — new
- `src/components/EventsListPage.tsx` (+ `.module.css`) — new
- `src/App.tsx` — new `/events` route
- `src/components/BuildInfo.tsx` (+ `.module.css`) — link after build date
- `src/components/DanceSchedulePage.tsx` (+ new `.module.css`) — debug-dump link
- `scripts/build-content-sets.mjs` — reserve `events`
- `docs/design/content-config.md`, `docs/adding-a-new-event.md`, `docs/design/content-sets.md` — doc updates
