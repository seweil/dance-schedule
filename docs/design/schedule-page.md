# Schedule page

## Context

The app needs a new page showing the dance schedule/events. The source of
truth is a `.xlsx` spreadsheet file committed to the repo (edited by hand,
not user-submitted), with one row per one-time event:

| Date | Start time – End time | Location | Description |
|------|------------------------|----------|--------------|

No recurrence — every event is a single dated occurrence. Multiple sheets
(e.g. per season or location) are anticipated for future work but out of
scope for this design; the current file has a single sheet.

This is a different kind of page from the rest of the site: existing pages
are markdown files auto-routed by `vite-plugin-pages` (see "Content
pipeline" in `CLAUDE.md`), but this page's content comes from parsing a
spreadsheet, not authoring markdown — so several conventions that are
settled for content pages (routing, nav integration, data flow) need a
fresh decision here.

## Sub-problems

### Parsing
- [x] Spreadsheet format — see Decisions
- [x] Parse timing (build vs. runtime) — see Decisions
- [x] Parsing library — see Decisions
- [x] Where the parsing step lives technically — see Decisions
- [x] Event schema & validation, incl. date/time cell parsing — see
      Decisions
- [x] Forgiving date/time format parsing (heuristics + test-case home) —
      see Decisions

### Storing
- [x] Where the parsed data lives at runtime, incl. sorting logic — see
      Decisions
- [x] Where the source `.xlsx` file lives in the repo — see Decisions
- [x] Routing & nav integration — see Decisions
- [x] PWA/offline behavior — see Decisions

### Rendering (responsive)
- [x] Layout design, incl. CSS-only vs. JS-driven switch — see Decisions
- [x] Breakpoint strategy — see Decisions
- [x] Empty/edge states — see Decisions
- [x] Test plan — see Decisions

## Decisions

### File format: `.xlsx`
**Why:** No formulas or cell formatting are needed, but multiple sheets
are expected in future work, and that's clumsy to manage as separate CSV
files. `.xlsx` isn't diffable in PRs the way CSV would be, but that's
outweighed by the multi-sheet requirement.

### Parse timing: build time
**Why:** The spreadsheet is a hand-edited file committed to the repo, not
user-submitted or frequently changing data — a rebuild+redeploy on each
edit is an acceptable cost. Parsing at build time keeps the client bundle
free of a spreadsheet-parsing library, and the resulting data is
automatically covered by the existing PWA precache with no new
service-worker caching logic, satisfying CLAUDE.md's offline guidance for
free.

### Parsing library: `read-excel-file`
**Why:** Small, installs normally from npm (no special tarball URL, unlike
SheetJS's latest releases), and has a Node-only entry point
(`read-excel-file/node`) for build-time use with no DOM dependency. Its
declarative `schema` option maps columns to typed fields (including `Date`)
and returns both parsed rows and a list of per-row errors in one step,
covering most of the schema-validation and date-parsing sub-problems too.
Confirmed it supports the future multi-sheet need — via `readSheet(file, {
sheet, schema })`, parsing one named/indexed sheet at a time (each can have
its own schema, which fits "future sheets may differ"). **Implementation-
time correction:** the originally-assumed `readSheetNames(file)` helper for
enumerating sheet names doesn't exist in the installed version (9.3.4) — it
was removed; per that version's changelog, "use the default exported
function instead" (`readExcelFile(file)`, no schema, returns all sheets as
`[{ sheet, data }]`) to discover sheet names when multi-sheet support is
actually implemented.

### Parsing step location: custom Vite plugin + virtual module
**Why:** Matches this repo's existing pattern for content routes (`~react-pages`
via `vite-plugin-pages`, see CLAUDE.md's "Content pipeline") — a virtual
module resolved by a small custom Vite plugin works uniformly across
`pnpm dev`/`build`/`preview` with no separate script wiring in
`package.json`, and can watch the `.xlsx` file for changes during
`pnpm dev`, mirroring how content hot-reloads today. The core parsing
logic itself will still be a plain, framework-agnostic function (testable
directly with Vitest) — the plugin is just a thin adapter exposing it as a
virtual module.

### Event schema & validation
**Decision:** The spreadsheet has one combined "Start time - End time"
column (not two separate columns), so `read-excel-file`'s schema only
handles the `Date` column natively (its `Date` type converts Excel's
serial date numbers for us); the time range is read as a plain string and
split by a small custom function afterward.

```ts
// Raw row shape, matching the read-excel-file schema directly
interface RawScheduleRow {
  date: Date        // from the "Date" column
  timeRange: string // e.g. "6:00 PM - 7:30 PM", from the combined column
  location: string | undefined
  description: string
}

// Shape the rest of the app consumes
export interface ScheduleEvent {
  date: Date       // calendar date (midnight)
  startTime: Date  // date + parsed start time, combined
  endTime: Date    // date + parsed end time, combined
  location: string | undefined
  description: string
}
```

Date, time range, and description are `required: true` — every event needs
those three. Location is `required: false`: some events aren't tied to one
room (e.g. an all-day or roving activity), so a blank Location cell is
valid; `ScheduleList` simply omits that line for such an event rather than
rendering it blank (see the Layout design decision below).

A `parseTimeRange(raw: string, date: Date): { startTime: Date; endTime:
Date }` pure function (unit-testable in isolation) splits the combined
column on its separator and combines each half with the row's date.

**Why fail-the-build applies here too:** per the earlier "malformed row"
decision, both `read-excel-file`'s own schema `errors` array and any
`parseTimeRange` failures are aggregated into one thrown error (listing
every offending row) so `pnpm build` fails loudly and clearly, rather than
letting a bad row silently disappear or crash with a single unhelpful
stack trace.

**To verify at implementation time:** the actual column header text in the
real spreadsheet file must match the schema's expected headers exactly
(read-excel-file matches by header name) — the names above are our best
guess and should be checked against the real file once it exists.

### Forgiving date/time format parsing: heuristics + test-case home
**Why:** Spreadsheet authors won't consistently type dates/times in one
exact format, and hand-editing a schedule shouldn't require remembering a
strict format. Rather than a single rigid parse per field, both date and
time parsing try a sequence of recognized formats/heuristics and fail the
build (per the earlier decision) only if none match.

**Where this lives — the "place for heuristics and test cases":**
- `src/lib/parseEventDate.ts` — normalizes the `Date` column. If
  `read-excel-file` already returns a JS `Date` (the cell was
  Excel-native date-formatted), use it directly. If it returns a string
  (the cell was text-formatted), try each supported format in turn: ISO
  (`2026-08-15`), US slash with 2- or 4-digit year (`8/15/2026`,
  `8/15/26`), and long-form (`August 15, 2026`, `Aug 15, 2026`) — plus the
  year-less forms below.
- `src/lib/parseTimeRange.ts` — normalizes the combined time-range
  column. Splits on a separator (`-`, `–`, or `to`), then parses each half
  as either 12-hour with AM/PM (case-insensitive, with or without a space
  or periods — `6:00 PM`, `6:00pm`, `6:00 p.m.`) or 24-hour (`18:00`).
- Each file has a **colocated, table-driven test file**
  (`parseEventDate.test.ts`, `parseTimeRange.test.ts`) — an `it.each`
  table of `{ input, expected }` (or `{ input, expectThrow: true }` for
  cases that should still fail) pairs. This table *is* the living
  documentation of every format the parser supports — adding support for
  a newly-discovered real-world format means adding a test case first,
  same as any other bug-fix-with-regression-test workflow. This is the
  concrete answer to "a place for heuristics and test cases."

**The two inference heuristics (deliberately chosen to be forgiving,
each with a documented, testable rule — not open-ended guessing):**
- **Meridiem inference** (e.g. `"6 - 7:30pm"`, `"11 - 1pm"`): if the start
  time has no AM/PM and the end time does, first try applying the end's
  meridiem to the start. If that would make the start time later than or
  equal to the end time on the same day (e.g. naively reading `"11 - 1pm"`
  as 11pm–1pm), flip the inferred meridiem instead, so the start always
  precedes the end (e.g. `"11 - 1pm"` → 11:00 AM – 1:00 PM). Both times
  explicitly specifying AM/PM, or both in 24-hour format, are unaffected
  by this heuristic.
- **Year inference** (e.g. `"8/15"`, `"Aug 15"`): assume the current year
  (as of build time); if that produces a date more than ~6 months in the
  past relative to build time, assume next year instead — handles the
  year-boundary case (e.g. building in December for a January event)
  without incorrectly rolling forward events from a few months ago, which
  we still want to show per the "show all events, past included"
  decision. **Caveat worth flagging:** this inference is anchored to
  *build* time, not real time — if the site goes a long time without a
  rebuild, a year-less date entered near a year boundary could be
  inferred against a stale reference point. Spreadsheet authors can
  always sidestep this entirely by including the year.
- Anything that still doesn't match any recognized format (date or time)
  fails the build with the offending row identified, per the existing
  fail-the-build decision — these heuristics widen what's *accepted*,
  they don't change what happens when nothing matches.

### Source file location: `data/event-schedule.xlsx`
**Why:** A new top-level `data/` directory mirrors `content/` and
`public/` as another distinct top-level input, without conflating a
spreadsheet with `content/pages/`'s markdown+images convention (which is
specifically for auto-routed page content) or `public/`'s "served as-is
to the client" convention (we deliberately don't want the raw `.xlsx`
shipped to the client at all, since it's parsed at build time). A single
file is enough since multiple sheets live inside one workbook, not
multiple files.

### Runtime data shape & sorting: `virtual:schedule` + `buildSchedule()`
**Why:** Mirrors this repo's existing `~react-pages` → `buildNavTree()`
pattern exactly (`src/lib/buildNavTree.ts`, called from `Nav.tsx`) — a
virtual module supplies raw data, and one pure, colocated-test-covered
function shapes it for rendering.

- The Vite plugin's virtual module (`virtual:schedule`) is generated via a
  plain `JSON.stringify`, so per the date-representation decision above,
  dates cross the boundary as ISO strings:
  ```ts
  export interface ScheduleEventData {
    date: string       // ISO date
    startTime: string  // ISO datetime
    endTime: string     // ISO datetime
    location: string
    description: string
  }
  ```
  A hand-written ambient module declaration (e.g. in `src/vite-env.d.ts` or
  a new `src/types/virtual-schedule.d.ts`) types `virtual:schedule` as
  `ScheduleEventData[]`, the same way `vite-plugin-pages/client-react`
  types `~react-pages` today.
- `src/lib/buildSchedule.ts` exports a pure `buildSchedule(data:
  ScheduleEventData[]): ScheduleEvent[]` that converts each `ScheduleEventData`
  into a `ScheduleEvent` (real `Date` objects, per the earlier schema
  decision) and sorts the result chronologically ascending by `startTime`.
  Colocated `buildSchedule.test.ts` covers conversion and sort order with
  fixture data — no virtual module or build step needed to test it, exactly
  like `buildNavTree.test.ts` today.
- Filtering (e.g. hiding past events) is deliberately **not** this
  function's job — that's a presentation concern, deferred to the
  Rendering section's empty/edge-states sub-problem, keeping the data
  layer generic (all events, sorted) and the filtering decision separate
  from the shaping decision.

### Routing & nav integration: extend `vite-plugin-pages` to also scan `src/pages/`
**Why:** `Nav`/`buildNavTree` already derive the menu generically from
whatever routes `vite-plugin-pages` produces (`src/components/Nav.tsx`
imports `routes` from `~react-pages` and passes them straight to
`buildNavTree`) — regardless of which directory a route came from. So the
least-invasive integration is to make the Schedule page look like just
another route to that plugin, rather than hand-wiring a one-off route and
nav entry outside this system.

- `vite.config.ts`'s `Pages({ dirs: [...] })` gets a second entry:
  `{ dir: 'src/pages', baseRoute: '' }`, and `extensions` becomes
  `['md', 'tsx']`. Each directory only contains files of its own
  extension today, so this doesn't change how `content/pages/` is scanned.
- `src/pages/10 event-schedule.tsx` is the route file — reusing the exact same
  `"<digits> "` order-prefix filename convention already used for content
  pages (e.g. `2 installation.md`), confirmed to work identically for
  hand-written `.tsx` routes since `buildNavTree`'s ordering logic
  operates on the resulting route path text, not the source directory.
- **Nav ordering convention:** prefix `10` is reserved for the Event
  Schedule page. Content pages using prefixes below 10 (the existing `2`,
  `3`, `4`) sort before it; any future page intended to sort after it
  should use a prefix of `10` or higher. This is a deliberate numbering
  scheme, not an accident — worth calling out to future contributors (e.g.
  in `CLAUDE.md`) once this page exists.
- **Default-export tension:** `vite-plugin-pages` (like most file-based
  routers) requires each route file to have a default export, which
  conflicts with this repo's "prefer named exports" convention
  (`CLAUDE.md`'s "Code conventions"). Resolved by keeping
  `src/pages/10 event-schedule.tsx` a thin wrapper — e.g.
  `export { SchedulePage as default } from '../components/SchedulePage'`
  — so the real, testable component keeps a normal named export in
  `src/components/SchedulePage.tsx`, and the mandatory default export is
  confined to the smallest possible routing shim.
- No changes needed to `buildNavTree.ts` or `Nav.tsx` themselves — this is
  the reason this approach was chosen over hand-wiring a route.

### PWA/offline behavior: no new caching strategy needed
**Why:** Since the schedule data is baked in at build time via the virtual
module (per the "runtime data shape" decision above), it ships as part of
the Schedule route's own JS chunk — the same as every other route today.
`vite-plugin-pwa`'s `generateSW` strategy (`vite.config.ts`) already
precaches all built JS/CSS output, so this data is covered automatically
with zero new `runtimeCaching` config. The only follow-up is a test, not a
config change: extend `e2e/app.spec.ts`'s existing offline test (or add a
sibling one) to visit `/schedule` after the service worker has taken
control and `context.setOffline(true)`, confirming the page still renders
from the precache — mirroring the pattern already used for the home page.
This is folded into the overall test-plan sub-problem in Rendering below,
not a separate implementation task.

### Layout design: date-grouped sections, always full-width single-column cards
**Why (superseded from an earlier version of this decision — see below):**
after seeing the initial implementation rendered, two refinements were
made: (1) the date was repeated on every card, which read as redundant
once several events shared a day — it's now a section-break `<h2>` heading
per calendar date (via a new `groupEventsByDate()` in `src/lib/`), with
that date's cards underneath and no date field on the card itself; (2) the
initial version gave desktop/landscape a multi-column card grid
(`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`), which is
now removed entirely in favor of always-full-width, single-column cards at
every viewport size — not a "denser desktop layout" as originally
designed, a deliberately simpler one.

This is still a single DOM structure with no JS-driven layout switch — CSS
alone still fully determines presentation, that part of the original
reasoning still holds (no `matchMedia`/resize listener, no conditional
rendering of two variants, no duplicated markup; still not a real
`<table>` or a calendar-grid view, both still rejected as too much
complexity for events that don't recur). What's rejected here is
specifically a *card* grid — multiple events side by side — not all
column layout: the time/location/description subgrid described in the
next note is a separate, still-live piece of responsive CSS, not a
contradiction of this decision.

**Why (superseded again — single shared grid, not one per date):** once
the viewport is wide enough (see Breakpoint strategy below), `ScheduleList`
uses CSS Grid with `subgrid` so the time/location/description columns of
every card line up (`.card { grid-template-columns: subgrid }`, reading
its column tracks from the parent `.list` grid). The date-grouped
structure originally gave each date its
own `<section>` wrapping its own `<ul class="list">` — its own separate
grid container. Grid track sizing is computed independently per container,
so columns aligned within a date but not *across* dates, each day sizing
its own columns from only that day's own content. Fixed by flattening to
one `<ul class="list">` for the whole page: each date heading is now a
plain `<li>` (spanning every column via `grid-column: 1 / -1`) sitting as
a sibling of that date's `<li class="card">` items, all inside the same
grid container, so every column's width is now computed once across every
row on the page. `<section>`/one-`<ul>`-per-date is gone entirely; a `<Fragment
key={...}>` per date group keeps the flat `<li>` sequence without adding a
wrapping DOM element (which would have defeated the point — one shared
grid needs the date heading and every card as direct children of the same
grid container). Per-date visual grouping (the border above each card
after the first, and the even/odd stripe restarting at each new date) can
no longer come from `:not(:first-child)`/`:nth-child(even)` sibling
selectors, since those now count across the whole flat list rather than
within one date's own items — replaced with an explicit `index` computed
per date group in `ScheduleList.tsx`, toggling `.cardDivider`/`.cardAlt`
classes directly instead.

A card with no location (see the Event schema decision above) simply
doesn't render a `.location` element at all, rather than rendering it
empty — so `.time`/`.location`/`.description` are given explicit
`grid-column` indices (1/2/3) rather than relying on grid auto-placement,
which would otherwise shift a location-less card's description into
column 2 instead of column 3.

**Why (superseded once more — width-gated, not orientation-gated):** the
subgrid column layout above was originally implemented behind
`@media (orientation: landscape)`, not a width breakpoint. That excluded a
portrait tablet (e.g. an iPad, ~768-834px wide) from ever getting the
aligned-column layout, even though there's plenty of horizontal room for
it and the column tracks are already `auto`-sized (not a fixed floor)
specifically so they degrade gracefully on narrow widths — orientation was
never a considered, written-down requirement for this, just an unexamined
"landscape ≈ wide enough" proxy from the original implementation (this
doc's own "Breakpoint strategy" section, below, had by this point already
gone stale and incorrectly claimed `ScheduleList` used no breakpoint at
all). Fixed by switching to `min-width: 640px` (see Breakpoint strategy
below), so the column layout now applies whenever there's enough width,
regardless of orientation — a portrait iPad gets it, a phone in portrait
(~390-430px) doesn't.

### Breakpoint strategy: `min-width: 640px`, duplicating `Nav`'s literal
**Why:** the column layout above is gated behind a `min-width: 640px`
media query, reusing `Nav.module.css`'s own breakpoint value — duplicated
rather than extracted into a shared token, per the original reasoning
below, since this is still only the second consumer. Width, not
orientation, is the right signal here: a portrait iPad (~768-834px) has
plenty of room for these narrow, content-sized columns, while phone
portrait (~390-430px) does not, and orientation alone can't distinguish
the two (a phone in landscape and an iPad in portrait are both physically
plausible at either orientation). `Nav.module.css` remains the only other
consumer of `640px`; the "reconsider extracting a shared token once a
third component needs it" guidance from the original decision still
stands.

**Update:** that threshold was crossed (six-plus consumers) and the value
has since been extracted into an actual shared token — `@media
(--tablet-and-up)`, resolved via `src/breakpoints.css`/`postcss-custom-media`
— rather than the literal `min-width: 640px` described above. See
`docs/design/responsive-breakpoints.md` for the full breakpoint catalog and
how the token works.

### Empty/edge states: show all events (no past-event filtering); explicit empty message
**Why:** All events render in chronological order regardless of whether
they're past or future — no "now" comparison logic to write or test, and
no risk of a correctly-scheduled event silently disappearing from the
page due to a timezone/clock edge case in a past/future comparison. If
the spreadsheet ever produces zero valid rows, the page renders an
explicit message ("No events scheduled") rather than an empty space below
the heading, so it's visually distinguishable from a loading/broken page.

### Test plan
**Why this split:** follows the same Vitest-for-logic /
Playwright-for-responsive-and-PWA-behavior split CLAUDE.md already
establishes and this repo already practices for `Nav`.

- **Vitest** (`src/lib/buildSchedule.test.ts`, colocated like
  `buildNavTree.test.ts`): conversion from `ScheduleEventData` (ISO
  strings) to `ScheduleEvent` (Date objects), chronological sort order,
  and the empty-array case — all pure-function, no virtual module needed.
- **Vitest**: the table-driven `parseEventDate.test.ts` and
  `parseTimeRange.test.ts` suites described in the date/time parsing
  decision above — every supported format, both meridiem/year inference
  heuristics (including the flip-on-ambiguity case), and unrecognized
  input throwing.
- **Vitest + Testing Library** (`src/components/SchedulePage.test.tsx`):
  renders event cards for a given fixture array of events; renders the
  "No events scheduled" message for an empty array. Doesn't assert
  CSS/responsive behavior — jsdom doesn't evaluate `@media` queries (the
  same reason `Nav.test.tsx` mocks its CSS module), so that's Playwright's
  job.
- **Playwright** (extending `e2e/app.spec.ts` or a new `e2e/schedule.spec.ts`):
  - Navigate to `/event-schedule` and assert the page renders event cards —
    asserting on structural/accessibility properties (e.g. at least one
    event card visible, an "Event Schedule" nav link that routes correctly)
    rather than exact event content, since the real `data/event-schedule.xlsx`
    is live hand-authored content, not a test fixture — coupling
    assertions to its exact contents would make the suite brittle to
    ordinary content edits.
  - Mobile-viewport test (following `Nav`'s precedent) confirming the card
    list reflows and the page has no horizontal overflow at the iPhone 13
    viewport.
  - Offline test extending the existing pattern: after the service worker
    takes control, `context.setOffline(true)`, reload `/schedule`, and
    confirm it still renders from the precache.

## Open questions

(none yet)
