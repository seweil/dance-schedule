# Dance schedule (data model, parsing, storage)

## Context

The simple schedule page (`docs/design/schedule-page.md`) shows a flat
list of events grouped by date. The user wants a much richer "Dance
Schedule" — a **new page/tab**, existing alongside the simple schedule
(which is untouched by this work) — modeled on a real multi-day dance
convention: multiple rooms running in parallel, skill-level tracks,
named callers, and standalone one-off events.

The user provided both a reference PDF (`scratch/Dance Schedule.pdf`,
kept for context) and the **actual real source spreadsheet**
(originally `scratch/Dance-Schedule.xlsx`, now `data/dance-schedule.xlsx`)
for a real convention (Montreal Mix 2026). This phase covers **only the
data model, parsing, and storage** for that source file — no page,
route, nav/tab integration, or rendering yet; that's deliberately a
separate, later phase.

## Sub-problems

- [x] What does the real source file actually contain? — see Decisions
- [x] Parse the existing format vs. ask for re-entry into clean columns
      — see Decisions
- [x] How to determine each session's date (sheet names have no year)
      — see Decisions
- [x] How to model multi-level sessions (two different separators seen
      in real data) — see Decisions
- [x] Level code validation — see Decisions
- [x] How to model caller(s) vs. the optional "GCA" role — see Decisions
- [x] How to handle cells that don't match the expected pattern — see
      Decisions
- [x] Time format support (real data uses bare "a"/"p" with no "m") —
      see Decisions
- [x] Error message format, so a spreadsheet maintainer can find and fix
      a problem in Excel — see Decisions
- [x] Where the parsing/storage code lives — see Decisions
- [x] Debug output: when/where to generate a normalized dump of the
      parsed interpretation — see Decisions
- [x] Debug page: production inclusion and nav visibility — see
      Decisions
- [x] How to model a session that spans more than one room — see
      Decisions
- [x] How to model a session with no room at all (e.g. a lunch break) —
      see Decisions
- [x] Authoring convention for the above, given the parsing library has
      no merged-cell support — see Decisions
- [x] Second view with level slots as columns instead of rooms, same
      date/level/GCA selectors — see Decisions
- [x] How two different sessions can share a level at overlapping times
      (impossible for rooms, real for levels) — see Decisions

## Decisions

### The real source file's actual shape
**What we found** (inspected directly with `read-excel-file`, not
inferred from the PDF): **3 sheets, one per day** (`"Thursday July 2"`,
`"Friday July 3"`, `"Saturday July 4"`) — sheet names are weekday +
month + day, no year, and there's no date column anywhere. Each sheet is
a genuine grid: row 1 = room names (varies per sheet — Friday has no
"Salon 6/7" column), each following row = a time slot in column 0 (e.g.
`"12:30p-1:30p"`), each remaining cell = one compound-text session (e.g.
`"Plus : Dancing - Kris Jensen\nGCA: Tim Stephens"`) or empty. Extracted
from all ~150 real cells: level prefixes actually used are `SSD`, `Plus`,
`C1`, `C2`, `C3A`, `C3B`, `C4`, `A1`, `A2`, `Intro`, `Various`, plus
combined forms `"C1 & C2"` and `"A1/A2"` (two different separators);
exactly 2 cells have no colon at all (`"Intro to calling - Bill Eyler"`,
`"Country Western Dance - until 1am"`); the GCA line is optional; some
cells have two co-callers joined by `&` in the caller position (e.g.
`"Michael Kellogg & Terri Sherrer"`), the same character used for
multi-level.

### Parse the existing grid format directly
**Why:** ~150 real sessions already exist in this exact format. Asking
for manual re-entry into clean columns would be significant, error-prone
busywork for no real benefit — the parser can absorb the complexity
instead. Rejected alternative: re-enter everything into one-row-per-
session clean columns (simpler parsing, but throws away real, already-
correct data entry).

### Dates come from the sheet name + year inference
**Why:** No spreadsheet changes needed. Strip the leading weekday word
(`/^\w+day\s+/i`) from the sheet name (`"Thursday July 2"` → `"July 2"`)
and feed the remainder to the existing `parseEventDate` (`src/lib/`),
whose year-inference heuristic (assume current year, roll to next if
that's >6 months in the past at build time) already handles a year-less
date. Reused unchanged from the simple schedule's parser.

### Multi-level sessions: one record with an array of levels
**Why:** Faithful to reality — it's one session serving two levels, not
two sessions. The level-portion (text before the first `:`) is split on
`/[&/]/` to support **both** real separators (`"C1 & C2"` and
`"A1/A2"`), each piece validated against a fixed `LEVEL_CODES` list
(`src/types/danceSchedule.ts`) — an unrecognized code fails the
build. `LEVEL_CODES` includes `MS`/`Advanced` preemptively (present in
the convention's printed legend but not in this 3-day excerpt's actual
data) alongside everything actually observed, including the informal
`Intro`/`Various` tags — easy to adjust later if the taxonomy turns out
to need it.

### Callers are a list; GCA is a separate, distinctly-triggered field
**Why (a real correction made mid-design):** initially assumed a co-
caller joined by `&` (e.g. `"Michael Kellogg & Terri Sherrer"`, no
separate GCA line) should be split into `(caller, gca)`. That's wrong —
a session can have **multiple primary callers**; `&` there just joins
co-teachers. `callers: string[]` always holds the primary caller(s).
`gca` is populated **only** when an explicit line starting with `GCA:`
follows the main description — never inferred from an `&` in the caller
position. This is why `levels` and `callers` are separate array fields
using the same `&`/`/` characters, but resolved independently by parse
*position* (level-portion is only the text before the first `:`;
caller-portion is only the text between the type's `-` and either the
end of the first line or a following `GCA:` line) — never by a single
whole-string split.

### Non-conforming cells: an explicit `"* "` prefix, otherwise fail loud
**Why:** A cell whose text starts with `"* "` is treated as a literal
freeform description (`FreeformSessionData`, no structured parsing
attempted). Anything else that doesn't match `"Level : Type - Caller(s)
[GCA: Name]"` **fails the build** — consistent with this project's
fail-loud philosophy for spreadsheet data (`docs/design/schedule-page.md`).
The 2 real non-conforming cells found got the `"* "` prefix added
directly (`data/dance-schedule.xlsx`), rather than having the parser
guess at an unstated pattern.

### Time format: reused, extended to accept bare `a`/`p`
**Why:** The real data uses `"12:30p-1:30p"` — no trailing `m` at all.
`src/lib/parseTimeRange.ts`'s `TIME_PATTERN` regex was updated to make
the `m` optional (`([ap])\.?(?:m\.?)?` instead of requiring `m`), so
`"12:30p"`/`"12:30pm"`/`"12:30 PM"`/`"12:30 p.m."` all parse identically.
Table-driven test cases cover the bare form; all prior formats keep
working (verified — the full existing `parseTimeRange.test.ts` suite
still passes unchanged).

### Error message format: sheet + Excel cell reference + time + room
**Why:** The user explicitly needs a well-formatted error list so a
non-technical spreadsheet maintainer can find and fix a problem in
Excel. Each error names the sheet tab, the literal Excel cell address
(e.g. `F3`, computed from the row/column index) *and* the human-readable
time-slot and room labels, so it's findable either via Excel's Name Box
or by eye. `parseDanceScheduleSheet` (`src/lib/`) doesn't throw
per-cell — it returns `{ sessions, errors }`, letting
`vite-plugin-dance-schedule.ts` aggregate errors across all 3 sheets
into **one** thrown error listing everything at once:

```
Failed to parse data/dance-schedule.xlsx — 1 error(s):

  Sheet "Thursday July 2", cell F2 (time "12:30p-1:30p", room "Hemon"):
    Unrecognized level code "C5" in "C5 : Dancing - Vic Ceder"
```

(This exact message was produced by a real end-to-end test: temporarily
corrupting one real cell and confirming the build/parse failure showed
this precise format, then restoring the real file.)

### Where the code lives
- `src/types/danceSchedule.ts` — `LEVEL_CODES`/`LevelCode`, the
  `StructuredSessionData`/`FreeformSessionData` discriminated union
  (`DanceSessionData`) crossing the virtual-module boundary as ISO
  strings, and the Date-object `DanceSession` equivalent. Each session's
  `location: SessionLocation` (below) replaced an earlier single
  `room: string` field.
- `src/lib/parseDanceScheduleSheet.ts` (+ colocated test, using real
  examples from the actual cell catalog) — the pure matrix-walking
  parser for one sheet.
- `src/lib/buildDanceSchedule.ts` (+ test) — converts ISO-string data
  to Date objects, sorted chronologically; mirrors `buildSchedule.ts`'s
  pattern exactly.
- `vite-plugin-dance-schedule.ts` — resolves `virtual:dance-schedule`
  (typed via `src/types/virtual-dance-schedule.d.ts`) by reading
  **every sheet** via `read-excel-file`'s default export (`readExcelFile`,
  not the schema-based `readSheet` — this file's matrix shape doesn't
  fit the row-per-object schema model the simple schedule uses) and
  calling `parseDanceScheduleSheet` per sheet. Mirrors
  `vite-plugin-schedule.ts`'s build-time-only, dev-file-watching
  structure. Registered in `vite.config.ts` alongside `schedulePlugin()`.

**Verified end-to-end** (not just unit tests): the real
`data/dance-schedule.xlsx` parses all real session cells with
**zero errors** (151 originally, now 153 after the two lunch-break rows
described below); spot-checked the trickiest real cases directly
(multi-level via `&`, multi-level via `/`, co-callers with no GCA, both
`"* "`-prefixed freeform cells, and correct date resolution for all 3
days) against the actual parsed output.

### Debug dump: auto-generated at build time, committed to the repo
**Why:** `src/lib/formatDanceScheduleMarkdown.ts` (+ test) produces a
normalized, human-readable markdown dump of the parsed interpretation —
one table per date (Time/Room/Level(s)/Details/GCA), grouped via a new
`src/lib/groupDanceSessionsByDate.ts` (mirrors `groupEventsByDate.ts`).
`vite-plugin-dance-schedule.ts` writes this to
`data/dance-schedule-dump.md` every time it successfully parses the
source file (in the same `load()` hook, right after computing sessions),
so it's always in sync. It's committed to the repo (not gitignored) so a
change to the source spreadsheet shows up as a reviewable diff in PRs —
letting anyone eyeball whether the interpretation changed as expected
without needing to open Excel or run the app.

### Debug page: included in production, not linked from nav
**Why:** `src/components/RawDanceScheduleTable.tsx` (presentational,
testable with fixture data, dense/desktop-only styling — no responsive
breakpoints) + `RawDanceScheduleDebugPage.tsx` (thin wiring, imports
`virtual:dance-schedule`) render at `/debug/dance-schedule`. The "Raw"
prefix on this component pair distinguishes them as an unformatted/
unfiltered dump, consistent with the project's "Event" vs. "Dance" vs.
"Raw" naming (see `CLAUDE.md`). The route is added directly in
`App.tsx`'s `useRoutes` call, **not** through `~react-pages`/
`src/pages/` — `Nav`/`buildNavTree` derive the menu straight from
`~react-pages`'s own routes (`src/components/Nav.tsx`), so a route added
only in `App.tsx` is reachable by URL but never appears in the nav, with
no conditional/env-based route exclusion needed. Simpler than gating the
route out of production entirely, at the cost of shipping the debug
page's code and the dance-schedule data in the main bundle (confirmed:
this route isn't code-split the way `~react-pages`-derived routes are,
since it's a plain object merged into the same route array rather than
going through `vite-plugin-pages`' per-page chunking).

### Room-spanning and roomless sessions: a `location` field, not `room: string`
**Why:** Before the real display page is built (see the deferred
rendering phase below), two more shapes needed to be representable: a
single session spanning 2+ rooms (e.g. an all-attendee event in a
combined space) and a session with **no** room at all (e.g. a lunch
break). `room: string` was replaced with a discriminated
`location: SessionLocation`:

```ts
export type SessionLocation =
  | { kind: 'located'; rooms: string[] }  // 1+ rooms; length 1 is the normal case
  | { kind: 'roomless' }                   // no room at all
```

Every existing real session still resolves to `{ kind: 'located', rooms:
[<its one room>] }` by default — no behavior change for the 151
already-real sessions.

### Authoring convention: a `ROOMS:` text line, not merged Excel cells
**Why:** Checked whether `read-excel-file` (already parsing this data)
exposes merged-cell information — it doesn't; its return type is a bare
`(CellValue|null)[][]` matrix with no merge/span metadata anywhere in its
API, and this is architecturally out of scope for the library, not a
version gap. Switching to a library that does support merges (e.g.
`exceljs`) would mean replacing the foundation the whole pipeline is
built on, for this feature alone. Instead, a session's room(s) are
declared with a `ROOMS:` line inside the cell text, mirroring the
existing `GCA:` line convention exactly:

```
SSD : Combined Dance - Vic Ceder
ROOMS: Ballroom Centre, Ballroom East
```

entered once, in **one** of the spanned rooms' cells for that row; the
other spanned rooms' cells for that row are left blank. `ROOMS: NONE` is
a distinct sentinel meaning no room at all (not "every room") — used for
a lunch break or similar:

```
* Lunch Break
ROOMS: NONE
```

Validation: every room named must exist in that sheet's header row
(typo protection); the list must include the cell's own room (no
implicit "plus wherever it's typed" behavior); every *other* named
room's cell in that row must be genuinely blank, or it's a fail-loud
content collision. Adjacency of the named rooms (whether they end up as
neighboring grid columns) is **not** validated here — that's a rendering
concern for the deferred display phase, not a parsing concern.

`GCA:` and `ROOMS:` are now both **generic trailing metadata lines**,
popped off the end of the cell text (in either order, at most one of
each) before the remaining "main content" is parsed as freeform or
structured — previously `GCA:` was structured-only; a roomless lunch
break is freeform + `ROOMS:`, so the extraction had to generalize to
both cell kinds.

### Ditto mark (`"`): spatial shorthand for the common contiguous-room case
**Why:** Typing `ROOMS: A, B` is more ceremony than a spreadsheet author
should need for the common case of two rooms that are already next to
each other as grid columns. A cell whose entire trimmed content is a
single `"` means "this room belongs to the same session as the content
cell immediately to its left in this row" — the familiar paper "ditto"
convention. The parser resolves a full ditto chain (however many `"`
cells follow a content cell) back to that content cell's room list, with
no `ROOMS:` line needed. Kept strictly horizontal/left-neighbor for now
(not a "repeat the cell above" convention — a different, unrelated idea
and out of scope here). A dangling ditto (nothing valid to its left, or
a blank cell breaking the chain) and a cell with **both** an explicit
`ROOMS:` line and ditto cells pointing at it both fail the build loudly
— the latter is deliberately ambiguous (pick one mechanism, not both).

### Real example data added to the actual spreadsheet, not just fixtures
**Why:** Rather than only covering these new shapes with synthetic test
fixtures, two real edits went into `data/dance-schedule.xlsx` itself, so
the whole pipeline (including the real 151+ session build) exercises
them end-to-end:
- Friday July 3's "All Callers Dance" (10:15–11:00 AM), previously only
  in the `Ballroom Centre` column, now also spans `Ballroom East` via a
  ditto mark in that (previously blank) cell — a real, plausible edit,
  and probably how an actual spreadsheet author would do it.
- A `"* Lunch Break\nROOMS: NONE"` row was appended to both Friday
  (`12:00p-1:30p`) and Saturday (`12:00p-2:00p`), in the natural gaps
  already visible in the schedule between the late-morning and early-
  afternoon session blocks.

Verified via a `data/dance-schedule-dump.md` diff after rebuilding:
exactly these three changes appeared, nothing else shifted.

### Level slider: a `LevelSlot` indirection, so A1/A2 can combine into one stop per content set
**Why:** Some events want the skill-level filter slider to treat A1 and A2
as one combined position (per-event feature flag `combineA1A2`, from
`content/<set>/config.yaml` — see `docs/design/content-config.md` for the
config mechanism itself). Every slider position used to map 1:1 to exactly
one `LEVEL_ORDER` entry, with `isSessionInLevelRange` and the tick
rendering/click handling all keyed on that raw array index — no
indirection to hook a merge into. `src/lib/levelOrder.ts` now exposes
`getLevelSlots(combineA1A2): readonly LevelSlot[]`, where a `LevelSlot`
(`{ label: string; levels: readonly OrderedLevelCode[] }`) is usually one
level but two (`{ label: 'A1/A2', levels: ['A1', 'A2'] }`) when combined —
9 slots instead of 10, in A1's/A2's place. `isSessionInLevelRange` resolves
each of a session's levels to a *slot* index (not a direct
`LEVEL_ORDER.indexOf`), so a session tagged only A1, only A2, or both all
resolve to the same slot when combined — a real filtering merge, not just
a relabel. `slots` is threaded from `useDanceScheduleFilters` (which
computes it once from the flag) through `filterDanceSessions` and out to
`DanceScheduleFilters`, which renders ticks from `slots` instead of
importing `LEVEL_ORDER` directly — `moveNearestThumb` needed no change, it
already only operates on plain indices. `LEVEL_ORDER` itself, and
`levelColors.ts`'s use of it for card color-coding, are unaffected —
combining on the slider is a filtering/display concern only, not a change
to the underlying level data or how sessions are colored.

### Level-columns view: a second grid, same filters, level slots as columns

**Why:** Alongside the room-column × time-row grid (`DanceScheduleGrid.tsx`,
`/dance-schedule`), some users want to scan a single skill level across every
room at once — e.g. "what's running at C1 all day?" — which the room-columns
view doesn't answer directly. Rather than adding a mode toggle to the existing
page, this is a second page (`/dance-by-level`,
`DanceScheduleLevelsPage.tsx`) reusing the exact same date/level-range/GCA
selectors (`DanceScheduleFilters.tsx`, unchanged) and the exact same
`useDanceScheduleFilters` hook — including its `localStorage` persistence, so
switching between the two pages keeps the same selection instead of resetting
it. The hook itself no longer computes a room layout internally; it now
returns `dateSessions`/`visibleSessions`, and each page turns that into its
own layout via its own `compute*` function
(`computeDanceScheduleLayout`/`computeDanceScheduleLevelLayout`).

The genuinely shared, axis-agnostic half of the layout math (day-bounds
trimming, hour/half-hour marks, `rowStartFor`/`rowSpanFor`, and the
`isContiguous` span check) was extracted into
`src/lib/computeDanceScheduleTimeAxis.ts`, used by both layout functions —
the two grids' *time* behavior is identical by construction, not just by
convention. Card sizing constants (row height, overflow-estimate font/
padding) similarly moved to `src/lib/danceScheduleCardSizing.ts`, and the
"combine primary + details onto one line when short on space" heuristic
(`estimateCardFit.ts`) was renamed from `levelsText`/
`shouldCombineLevelAndDetails` to `primaryText`/`shouldCombinePrimaryAndDetails`
now that it's shared by both grids with different bold-label semantics.

**Columns are the filter's own range, not data-derived:** unlike rooms
(discovered per-date via `deriveRoomOrder`, hidden once nothing in a room
is visible), a level-columns view's columns are exactly
`getLevelSlots(combineA1A2).slice(minLevelIndex, maxLevelIndex + 1)` — the
level-range slider directly picks the visible column range, always shown in
full even for a slot with nothing scheduled that day. This is a genuine
simplification versus the room view (no "hide an empty column" logic needed
at all) and matches what a level-range selection should mean in this view:
"show me these levels," not "show me these levels, except any with nothing
in it."

**A session with no ordered level** (a freeform session, or a structured
session tagged only `Advanced`/`Intro`/`Various` — not in `LEVEL_ORDER`)
floats across every visible slot column, exactly mirroring how a roomless
session already floats across every visible room column today. A
contiguous multi-level session (today only ever `A1, A2` or `C1, C2`) gets
one spanning placement across its columns, same as a contiguous multi-room
session — reusing the same `isContiguous` check, just applied to
(`minLevelIndex`-relative) slot indices instead of room indices.

**Cards stay colored by level** (`colorForSession`, unchanged), even though
level is already encoded by the column in this view and the coloring is
therefore visually redundant — considered switching to color-by-room
instead (which would add non-redundant information), but decided against
it to avoid a second color-mapping concept; simplicity won over the
marginal visual gain.

### Overlap lanes: two sessions can share a level at an overlapping time

**Why:** A room is exclusive real estate — the parser and the room-columns
layout algorithm have never needed to handle two sessions in the same room
at overlapping times (confirmed: no such handling exists anywhere in the
codebase, and it doesn't occur in the real or test data). A **level**
isn't exclusive: two different sessions in different rooms can trivially
share a level at overlapping times, and the level-columns view puts them
in the same column, where they'd otherwise silently overlap on screen.

Sessions sharing a level at overlapping times render as side-by-side
sub-columns within that level's column (calendar-day-view style), sized
and positioned by each session's actual time extent — not simply stacked
in one cell — via a new lane-assignment algorithm in
`computeDanceScheduleLevelLayout.ts`: entries claiming the same level slot
are grouped into overlap-clusters by a standard interval sweep, then each
cluster's entries are assigned lanes via the classic greedy "first free
lane" calendar-layout algorithm (sort by start, place in the first lane
whose last occupant has already ended, else open a new lane). Rendered by
`DanceScheduleLevelGrid.tsx`'s `SessionCard` setting `width`/`marginLeft`
as plain percentages (`100 / laneCount`, offset by `lane`) on the card's
existing single-column CSS Grid item — no nested grids or absolute
positioning needed, since a grid item is free to not fill its track's full
width. The overflow-estimate heuristic (`shouldCombinePrimaryAndDetails`)
divides its assumed text width by `laneCount` too, since a lane-split card
is narrower and more likely to need its primary/details lines combined.

**Simplification for the doubly-rare compound case:** a contiguous
multi-level session (e.g. `C1, C2`) that *also* conflicts with another
session in one of its columns can't keep its wide visual span AND show
the conflict correctly in just one of its columns — it decomposes into
separate single-column placements instead, each with its own lane. This
loses the "one combined class" visual span for that specific occurrence,
in exchange for not needing full 2D rectangle-packing. Accepted because
this compound case has never been observed in real or test data — only
unit-tested (`computeDanceScheduleLevelLayout.test.ts`), not exercised
live.

**Live-verified against the real data — a genuine surprise:** planned to add
a synthetic same-level/overlapping-time fixture to `content/test/`'s
spreadsheet for this, but there's no xlsx-writing library in this repo, and
decided with the user not to add one just for this. Turned out to be
unnecessary: the real `content/real/data/dance-schedule.xlsx` already
contains several genuine same-level, different-room, overlapping-time
cases (e.g. Thursday 2:00 PM SSD: "Skirt Work Hour" in Ballroom West
alongside a separate session in Jarry/Joyce) that nobody had previously
noticed, precisely because the room-columns view has no way to surface a
same-level collision — it only became visible once levels became columns.
All rendered correctly as side-by-side lanes on first try, both with
`combineA1A2` on and off (temporarily flipped `content/real/config.yaml`
to confirm the uncombined 10-column case, then restored it). The compound
"multi-level span that also conflicts" simplification (above) still has
no live example and remains unit-test-only.

## Open questions

- Adjacency of a multi-room `ROOMS:`/ditto session's columns isn't
  validated at parse time — deferred to whenever the real display page
  renders a column-spanning block (see below); revisit if that phase
  needs a stronger guarantee.
- Rendering of the *real* dance schedule page (room-column × time-row
  grid, date selector, skill-level range filter, GCA show/hide) is now
  built (`DanceScheduleGrid.tsx`) — see
  `docs/design/dance-schedule-mobile-scroll.md` for its own rendering-
  specific decisions. Its level-columns sibling
  (`DanceScheduleLevelGrid.tsx`) is documented above.
- The compound "multi-level span that also conflicts" case (see above) is
  simplified rather than fully general, and has never been observed in
  real data — the ordinary overlap case, by contrast, turned out to be
  real and is now live-verified.
