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
- [x] Third view: headline callers as columns, excluding GCA, skipping
      sessions with no caller entirely — see Decisions
- [x] Detecting a caller or room double-booked at overlapping times —
      see Decisions
- [x] Debug/dump summary of total hours per level and per caller — see
      Decisions

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

### Double-booking: no caller or room may overlap itself in time
**Why:** A person can't call from two rooms at once, and a room can't host
two different sessions at once — but nothing previously checked for this
across cells, only within one cell's own "ROOMS:" claim (see the
authoring-convention decision below). `parseDanceScheduleSheet` now tracks
every caller's and every located session's room bookings across the whole
sheet (a day) as it walks the rows, and fails the build if a new booking
overlaps one already recorded — half-open interval overlap, so a session
ending exactly when another starts isn't a conflict (same convention the
rendering layer's own lane-assignment uses). Checked per sheet only, never
across sheets, since two different days can never conflict. Scoped to
`session.callers` (headline callers) only, not `gca` — a GCA credit is a
subordinate role, not a second simultaneous booking.

This isn't hypothetical: turning it on immediately caught two real
double-bookings already present in the shared sample data (the same
caller — "Vic Ceder", then separately "Dayle Hodge" — booked in two rooms
at the same time, identically across `automated-testing`,
`MotivateToSeattle`, and `backtrack2abq`, which all trace back to the same
original spreadsheet). Both were genuine data-entry mistakes, not
intentional test fixtures, and were corrected directly in all three
`.xlsx` files once found — confirmed via each set's own
`dance-schedule-dump.md` diff afterward, showing only the two corrected
rows changed.

A same-row conflict from an explicit multi-room `"ROOMS:"` claim (the
claimed room's cell isn't actually blank) is still reported by that
check's own, more specific message ("claims room X, but its cell isn't
blank") — the new cross-row check recognizes when a room was already
flagged that way this row and skips re-reporting the identical clash under
a second, more generic message.

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

### Hour summaries: two cross-tabs before the full dump, shared by both the debug page and the markdown dump
**Why:** Before either the raw debug page or the markdown dump gets to the
full session-by-session listing, both now show two quick sanity-check
tables — total scheduled hours per level, and per headline caller — each
a cross-tab with **days as rows** (plus a final Total row) and levels/
callers as columns (plus a final Total column), so both the per-day and
grand totals are visible without needing to add anything up by hand.
`src/lib/computeDanceScheduleHourSummary.ts` (+ test) computes the
underlying per-level/per-caller-per-date numbers from the same parsed
`DanceSession[]` both artifacts already share; `RawDanceScheduleTable.tsx`
and `formatDanceScheduleMarkdown.ts` each transpose that shape into the
displayed cross-tab independently at render time (JSX table rows vs.
markdown table rows), so the two still render identical numbers from one
source rather than two independent computations that could drift — the
same reasoning behind those two files already mirroring each other for
the full listing itself. (The markdown renderer's header line must build
its cell list as one array — `['Date', ...columnHeadings, 'Total']` — not
interpolate `columnHeadings.join(' | ')` between two literal `| Date |`/
`| Total |` fragments, which left a stray empty column when there were no
data columns at all.)

Every `kind === 'structured'` session counts toward both tables, including
a `"GCA Caller Showcase Dance"` one and one tagged only with an unordered
level (`Advanced`/`Intro`/`Various`) — this is meant to be a complete,
honest accounting of the raw parsed data, not a mirror of the Dance by
Caller page's own curated exclusions (that page deliberately omits
showcase dances and low-hour callers for UX reasons that don't apply to a
debug tool). A freeform session contributes to neither table, having no
level or caller. `gca` is still never counted as a caller.

A session spanning more than one level, or co-taught by more than one
caller, splits its duration evenly across the *distinct* levels/callers it
lists (a literal duplicate name counts once, not twice) — so each table's
own grand total always equals the day's total structured-session hours,
never double- or under-counted (modulo whichever callers the hour
threshold below excludes). Level columns sort by the real skill
progression (`LEVEL_ORDER`, then `Advanced`/`Intro`/`Various` trailing)
rather than alphabetically; caller columns sort alphabetically. A level
with zero hours is omitted entirely as a column, same as before.

**The caller table also drops any caller whose own total is 3 hours or
under** (`MIN_CALLER_HOURS`) — per direct product decision, a separate,
independent threshold of the same name and value as the Dance by Caller
page's own `MIN_CALLER_HOURS` (same unit, same number, and — as of the fix
described in that page's own section below — the same event-wide-total
scope too, though the two constants remain independent rather than shared,
since they're separate product decisions that could in principle diverge).
Since
filtering happens before the Total row/column are computed, a filtered-out
caller's hours don't silently leak into either table's own totals — the
displayed grand total is honestly just the sum of the callers actually
shown.

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

### Room-columns order: median dance level by default, two config overrides, computed globally

**Why:** The room-columns view originally ordered columns purely by first
appearance in the source spreadsheet (`deriveRoomOrder`, then living inline
in `computeDanceScheduleLayout.ts`) — a side effect of how the parser
reconstructs column order, not a considered design choice. Per direct
product decision, that's now just one of three options, extracted into its
own `src/lib/deriveRoomOrder.ts` (worth its own file — and its own
`deriveRoomOrder.test.ts` — once it grew real branching logic, mirroring
this doc's existing precedent for `computeDanceScheduleTimeAxis.ts`/
`assignLanes.ts`):

- **Default (`danceSchedule.roomOrder` omitted):** increasing median dance
  level per room, average as the tiebreaker. Every `(session, room, level)`
  combination contributes one `LEVEL_ORDER` index to that room's data set —
  a session spanning two rooms counts toward both; a session with two levels
  counts both. A room with no leveled sessions at all (only freeform, or
  only Advanced/Intro/Various) has no data points, so it's treated as
  median/average `+Infinity` — sorts after every leveled room, and ties with
  every other such room, which is resolved by the same final tiebreak
  everything else falls back to: original spreadsheet order. This mirrors
  the level-columns view's own difficulty-ordered axis (`LEVEL_ORDER`) in
  spirit, applied per-room instead of being the axis itself.
  **Rooms are grouped, not sorted individually, so a real multi-room session's
  rooms always stay adjacent** (`groupSpanningRooms`): median-level sorting
  alone found a real regression against production data — the actual
  `backtrack2abq` event's "All Callers Dance" (spanning two ballrooms) and a
  three-ballroom Brunch both risked landing non-adjacent under a naive
  per-room sort, since nothing else ties their rooms' *levels* together,
  silently splitting what used to render as one merged card
  (`computeDanceScheduleLayout`'s pre-existing non-contiguous-span fallback)
  into duplicate side-by-side ones. Any two rooms that ever share a
  multi-room session's `rooms` list are unioned (transitively — union-find,
  so A-spans-with-B plus B-spans-with-C also keeps A/B/C together) into one
  group, sorted as a single unit (pooling every member's data points for
  the group's own median/average), and flattened back out preserving each
  member's relative spreadsheet position within the group — the same
  left-to-right order the `ROOMS:`/ditto-mark authoring convention already
  requires spanning rooms to be in.
- **`danceSchedule.roomOrder: spreadsheet`:** opts back into the original
  first-appearance behavior verbatim (the pre-existing `deriveRoomOrder`
  logic, unchanged, just no longer the only option).
- **`danceSchedule.roomOrder: [...]`:** an explicit list, used verbatim as
  the complete global sequence. Per direct product decision, this list must
  name **every** room in the event exactly once — `validateRoomOrderConfig`
  (also `deriveRoomOrder.ts`) enforces this at build time (see below),
  rather than silently accepting a partial list that could hide a forgotten
  room in a wrong/default position.

**Computed once, globally, from every date at once — not per date, and not
recomputed per date either:** per direct follow-up product decision, the
room sequence must be identical regardless of which date is being viewed,
not just individually stable *within* a date as the level filter changes
(the original, weaker guarantee). All three options above — median/average,
`spreadsheet`, and the explicit list — read from `allSessions` (every
session across every date, unfiltered), not one date's `dateSessions` the
way this function originally did; `spreadsheetRoomOrder`'s "first
appearance" and `groupSpanningRooms`'s adjacency grouping are both computed
across the whole event for the same reason. `computeDanceScheduleLayout`
calls `deriveRoomOrder` with its own `allSessions` parameter (the full,
unfiltered, every-date list — `DanceSchedulePage.tsx` passes its
module-level `sessions` constant, not the `useDanceScheduleFilters` hook's
per-date `dateSessions`) and filters the result down to `visibleRoomSet`
(still per-date/per-filter, from `visibleSessions`) to decide which of the
globally-ordered rooms actually get a column *today* — this is a pure
reordering of *which room gets which column position*, not a change to
*which rooms get a column at all* or anything else about the room-columns
view. `deriveRoomOrder` itself has no notion of "today" at all now — it
returns one full, ordered list of every room in the event, and the caller
alone is responsible for narrowing it to what's visible on a given date.

**Completeness validation needs the whole event's data, so it lives in
`vite-plugin-dance-schedule.ts`, not `vite-plugin-content-config.ts`:**
checking an explicit `roomOrder` array names every real room requires the
full multi-date room set from `dance-schedule.xlsx` — data
`vite-plugin-content-config.ts` (which only ever parses `config.yaml`) has
no access to. `vite-plugin-dance-schedule.ts` already builds that full set
once per parse (for `dance-schedule-dump.md`), so it gained a new
`contentDir` option (sibling to its existing `dataDir`, same value
`contentConfigPlugin` already receives) purely to locate and load that
event's `config.yaml` too — via the now-exported
`loadContentConfigData` (`vite-plugin-content-config.ts`, previously
private) — and call `validateRoomOrderConfig(builtSessions,
config.danceSchedule?.roomOrder, configFile)` right after building the full
session list, throwing a named error (matching this repo's other
config-validation error style) listing any missing, unknown (typo'd), or
duplicated room name. `config.yaml` is now also a watched file for
`virtual:dance-schedule` in dev (alongside `dance-schedule.xlsx` itself), so
editing the room list live re-triggers this same check.

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

### A second merge flag (`combineC3BC4`, labeled "C3B+") generalized `getLevelSlots` off a hand-duplicated array
**Why:** Some events also want C3B and C4 treated as one combined slider
position — same mechanism as `combineA1A2` above, but a second, independent
per-event flag (`content/<set>/config.yaml`'s `features.combineC3BC4`), since
an event might want either merge, both, or neither. The merged slot is
labeled `"C3B+"` (not `"C3B/C4"`), matching square-dance convention for "C3B
and above." The original single-flag `getLevelSlots(combineA1A2)` hand-wrote
a second 9-entry array for the combined case — `docs/known-issues.md` had
already flagged this as fragile (a future `LEVEL_ORDER` insertion could
silently fall out of sync with that hand-duplicated array), and adding a
second independent merge would have meant either a third hand-written array
per flag or a hand-written array per one of the four flag *combinations*,
multiplying that same risk. `getLevelSlots` now takes both flags
(`getLevelSlots(combineA1A2, combineC3BC4)`) and builds `LevelSlot`s by
walking `LEVEL_ORDER` once, splicing in each active merge's labeled slot in
place of the `LEVEL_ORDER` entries it covers (`buildLevelSlots`, given a list
of `{ label, levels }` merges) — asserting each merge's levels are a
contiguous run in `LEVEL_ORDER` (they are: A1/A2 and C3B/C4 are each adjacent
pairs) rather than trusting that by construction. Every downstream consumer
(`isSessionInLevelRange`, `filterDanceSessions`, `DanceScheduleFilters`,
`computeDanceScheduleLevelLayout`) already worked in terms of `slots`/slot
index, not `LEVEL_ORDER` index or the A1/A2 flag specifically, so none of
them needed to change for the second flag — exactly the payoff the original
`LevelSlot` indirection was designed for.

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
is visible), a level-columns view's ordered-level columns are exactly
`getLevelSlots(combineA1A2, combineC3BC4).slice(minLevelIndex, maxLevelIndex + 1)`, plus
one more fixed `"Other"` column always appended after them (see below) — the
level-range slider directly picks the ordered-level range, always shown in
full even for a slot with nothing scheduled that day. This is a genuine
simplification versus the room view (no "hide an empty column" logic needed
at all) and matches what a level-range selection should mean in this view:
"show me these levels," not "show me these levels, except any with nothing
in it." `"Other"` sits outside the slider's own range entirely (not a
selectable/filterable position) — matching that a no-ordered-level session
was already unconditionally visible regardless of the level-range filter
before this column existed.

**A session with no ordered level** (a freeform session, or a structured
session tagged only `Advanced`/`Intro`/`Various` — not in `LEVEL_ORDER`)
gets its own dedicated `"Other"` column (a synthetic `LevelSlot` appended
after the ordered-level slice — `OTHER_LEVEL_SLOT`,
`computeDanceScheduleLevelLayout.ts`) if it has a real room, or floats
across every visible column (including `"Other"`) if it's genuinely
roomless — mirroring roomless-session treatment in the room-columns view for
that latter case only. Originally *every* no-ordered-level session floated
across every column, unconditionally, but that broke for the common
real-room case: CSS Grid allows multiple items to occupy overlapping grid
cells with no collision detection, so a full-width card with a normal,
opaque background was simply painted over by any neighboring single-column
card sharing its row range — visually indistinguishable from the session
having rendered *inside* whichever single column happened to be empty at
that moment (reported live as a freeform "Country Western Dance" entry
appearing to render inside the "MS" column). A genuinely roomless session
(no location at all, e.g. a meal break) keeps the original floats-across-
everything treatment, since "nothing else happening in any room" is still
the correct thing to communicate for that case — only a real-room session
needed to stop floating. Once assigned `"Other"`'s fixed slot index, such a
session flows through the exact same per-slot pipeline as any real level
(lane assignment for concurrent overlaps, column-width growth, the
axis-stretch text-fit estimate) with no special-casing needed beyond
computing that one index. A contiguous multi-level session (today only ever
`A1, A2` or `C1, C2`) gets one spanning placement across its columns, same
as a contiguous multi-room session — reusing the same `isContiguous` check,
just applied to (`minLevelIndex`-relative) slot indices instead of room
indices.

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
unnecessary: the real `content/automated-testing/data/dance-schedule.xlsx` already
contains several genuine same-level, different-room, overlapping-time
cases (e.g. Thursday 2:00 PM SSD: "Skirt Work Hour" in Ballroom West
alongside a separate session in Jarry/Joyce) that nobody had previously
noticed, precisely because the room-columns view has no way to surface a
same-level collision — it only became visible once levels became columns.
All rendered correctly as side-by-side lanes on first try, both with
`combineA1A2` on and off (temporarily flipped `content/automated-testing/config.yaml`
to confirm the uncombined 10-column case, then restored it). The compound
"multi-level span that also conflicts" simplification (above) still has
no live example and remains unit-test-only.

### A long roomless session's excess duration is elided from the time axis itself, not clipped off its card
**Why:** A roomless session (spans every column — e.g. a meal break) can run
much longer than an ordinary dance session; left alone, its card would eat a
proportionally huge share of the grid's vertical space for what's essentially
dead time, pushing everything else far down the page. The first attempt at
this fixed the wrong thing: it capped the card's own row span and drew a
torn/jagged edge on the card's bottom border. That shrank the card visually,
but did nothing for the actual problem — later sessions still sat exactly as
far down the page as before, so overall scroll length was unchanged, and the
jagged edge appeared on the wrong element to boot.

The corrected design elides the excess time from the time axis
(`computeDanceScheduleTimeAxis.ts`) instead: `findElisionIntervals` scans a
day's sessions for any roomless one whose duration exceeds
`MAX_ROOMLESS_VISIBLE_UNITS` (1 hour), and — as long as no other session
overlaps that excess stretch, which would corrupt its own position — marks
an interval for removal. That interval sits in the *middle* of the session,
not tacked onto its end: the visible 1-hour budget splits evenly, half kept
at the start and half at the end, so the row immediately following a break
lines up with whatever real event actually comes next, rather than an
arbitrary point mid-break (e.g. a 12-2pm lunch shows 12:00-12:30 and
1:30-2:00, eliding the 12:30-1:30 middle — not "the first hour, then
nothing"). `compress()` then maps every raw row position through these
intervals, subtracting elided rows that fall before it, so
`rowStartFor`/`rowSpanFor`/`totalRowUnits` all shrink together: a session
scheduled after a long dinner break genuinely shifts up the page, reducing
real scroll distance, not just the break's own card height.

Every point within an elided interval — including both of its exact
start/end boundaries — compresses to the identical single row (the marker's
own row), so an hour/half-hour mark landing anywhere in that range, boundary
included, is dropped outright rather than merely deduped against its
neighbor: a mark can coincide with the *marker's* row without colliding with
another mark earlier in the same list (e.g. an hour mark landing exactly on
an elision's trailing edge, which happens whenever that edge falls on a
whole hour — a 90-minute break starting on the hour is a real example of
this, not just a hypothetical), so dedup-against-the-previous-entry alone
isn't sufficient.

The roomless card itself is never decorated or clipped — its own rowSpan is
just whatever the (now-compressed) axis naturally gives it, and its
time-range text still states the real start/end unchanged
(`formatSessionTimeRange`). The "something was omitted here" signal lives
instead on a new `elisionMarker` rendered in the time column (`gridColumn:
1`) at each compressed boundary — a genuine zigzag (an inline SVG polyline,
pointed evenly up and down, tiled via `background-repeat`) rather than the
one-sided "torn paper" gradient cut first tried, which read as a solid block
with a jagged top edge instead of a break in the ruler. Deliberately subtle
(light gray, thin stroke, short) so it reads as a quiet ruler notch, not
competing with real content — by construction it lands exactly on the
compressed roomless card's own vertical midpoint (half the visible budget
before it, half after), matching "the middle of remaining space" rather than
the label-to-label distance, which can include real, un-elided gap time
after the break's actual end. Unlike `.timeLabel`/`.halfHourLabel`, it is
*not* sticky — it scrolls with the grid's horizontal position rather than
staying pinned to the time column, so it scrolls out of view once the room
columns scroll far enough left, where the real time labels remain visible.
`DanceScheduleLayout`/`DanceLevelScheduleLayout` both carry an
`elisionMarkers: number[]` (row positions) propagated straight from the
shared time axis, so the two grids can't drift out of sync on where a
break's excess time got elided. Exactly 1 hour is left un-elided (only
*greater than* 1 hour triggers it) — the real `content/automated-testing/`
"Lunch Break" (90 minutes) and a "Dinner Break"-style 2.5-hour session both
demonstrate this live.

### A card whose content overflows stretches the time axis, the expansion counterpart to elision above
**Why:** `docs/known-issues.md` documented a separate, pre-existing bug: a
short (~30min) session's card is a fixed, time-proportional height with
`overflow: hidden`, so a long details line (event type + caller name(s))
could wrap to more lines than the card actually had room for and get
visibly clipped — a partial mitigation (combining the level/room and
details text onto one line when estimated to help) resolved some but not
all real cases. Growing the card itself taller than its row span would
break "vertical position exactly encodes time" for every session below it
on the page; the elision mechanism above already establishes the right
place to make that kind of change safely — the shared time axis itself,
not a single card's own box.

`expandDanceScheduleTimeAxis` (`computeDanceScheduleTimeAxis.ts`) is
`compress()`'s direct mirror image: instead of removing rows for
known-empty roomless excess time, it inserts extra rows right after an
overflowing placement's own trailing edge (`rowStart + rowSpan`), never
at its start — the same reasoning as elision's own "adjust the axis, not
the card" principle, just run in the opposite direction. Layered as an
independent second pass on top of the ordinary (elision-compressed) axis:
each grid's layout function (`computeDanceScheduleLayout.ts`/
`computeDanceScheduleLevelLayout.ts`) places sessions exactly as before,
then — now knowing each placement's real column width (`roomTextWidthPx`/
`levelTextWidthPx`, lane-aware for the level-columns view) — estimates a
deficit via `estimateCardFit.ts`'s `estimateCardFit` (extended to report a
real `neededHeightPx`, crediting the combine mitigation first) and
`estimateCardExpansion.ts`'s `estimateCardRowExpansion`, capped at
`MAX_EXPANSION_ROWS_PER_SESSION` (4 — a defensive ceiling against one
pathological details string stretching the whole page's scroll length,
not a "just enough" tuning). `expandDanceScheduleTimeAxis` composes all of
a day's expansions into one remap, so every consumer (later placements,
hour marks, `totalRowUnits`) stays self-consistent, mirroring elision's
own guarantee.

Two accepted, deliberate tradeoffs, not defects: a stretch adds harmless
shared vertical slack to every other room/lane's card at that same moment
too (row heights are shared across the whole grid), even ones whose own
text already fit fine — unlike elision, which only ever touches provably-
empty time, this one necessarily touches a real, occupied moment. And
unlike elision, a stretch renders with **no visual marker** — an initial
version added a zigzag in the opposite orientation/tint from elision's,
but real data (a run of several consecutive short overflowing cards, e.g.
a block of `GCA Caller Showcase Dance - <name>` sessions) produced a
dense, distracting run of markers, so it was removed; a stretched row is
silent. The underlying row positions are still exposed as
`expansionMarkers: number[]` on both layouts (parallel to
`elisionMarkers`) for potential future use, just not rendered today.

### Half-hour marks are conditional, forced around off-grid boundaries, and visually secondary to hour marks
**Why:** The sticky time column originally showed an hour label every hour
unconditionally, plus a small dash tick (`.halfHourTick`) at every half hour
unconditionally too. Live feedback: "technically correct" but a usability
failure — the dashes carried no time information and were always present
regardless of whether anything actually started or ended there, pure visual
noise most of the time.

Fixed by making a half-hour position a real formatted label
(`hourFormatter.format(time)`, the same formatter hour marks already use),
shown only when it's meaningful, in `computeDanceScheduleTimeAxis.ts`:
- **Base rule:** a half-hour candidate gets a label only if some
  `visibleSessions` session's `startTime`/`endTime` lands there exactly —
  not merely a session spanning through it.
- **Off-grid forcing:** a session boundary that's itself neither hour- nor
  half-hour-aligned (only possible at :15/:45, given this file's 15-minute
  grid) floors/ceils to its two surrounding half-hour positions; whichever
  of those two ISN'T already an hour (always unconditionally shown) gets
  force-included as a label even though no session starts/ends exactly
  there. Net effect: every off-grid boundary always has a labeled reference
  point immediately before and after it, never an unlabeled gap wider than
  one 30-minute step — one side from the pre-existing unconditional hour
  mark, the other from this forcing rule.
- **`visibleSessions`, not `dateSessions`,** drives both rules above (same
  reasoning throughout this file: a label should only ever correspond to
  something the user can actually see) — a session the level filter hides
  triggers no half-hour label, forced or otherwise.

`DanceScheduleTimeAxis.halfHourMarks` changed shape to match `hourMarks`
exactly (`HourMark[]`, not `number[]`) as a result — both are now genuinely
the same kind of thing (a labeled row position), just with different
inclusion rules, so `DanceScheduleGrid.tsx`/`DanceScheduleLevelGrid.tsx`
render both through the same `.timeLabel` markup. Hour marks stay visually
primary and half-hour marks secondary via a `.halfHourLabel` CSS modifier
class layered on top (`` `${styles.timeLabel} ${styles.halfHourLabel}` ``,
the same base-class-plus-modifier composition `DanceScheduleFilters.tsx`
already used for `${styles.field} ${styles.levelField}`) that overrides only
`font-weight` back down from `.timeLabel`'s new bold default — `.halfHourTick`/
`.halfHourTick::after` are deleted entirely, no replacement dash needed.

### The axis is not a clock: dropped the linear time-proportional scale entirely, superseding elision, expansion, and the half-hour-label rules above
**Why:** Even after the half-hour-label rework immediately above, live
feedback was still "too technical." The real problem wasn't any one rule —
it was the underlying model: a fixed clock grid (hour/half-hour positions)
with progressively more special-case logic bolted on to patch its edge
cases (elision to compress dead time, expansion to grow rows for overflowing
text, off-grid forcing to cover :15/:45 boundaries, a bold/dim hierarchy to
tell hour and half-hour marks apart). Each patch was locally justified but
the sum reads as complex machinery for what should be a simple idea.

The reset: **the vertical axis is not a clock at all.** It's just the
ordered sequence of distinct times some currently-visible event actually
starts or ends at (`computeDanceScheduleTimeAxis.ts`'s `tickTimes`, built
directly from `visibleSessions.flatMap(s => [s.startTime, s.endTime])`,
deduped and sorted). Every tick is, by construction, a real event boundary —
so every tick gets a label, always, with no conditional-inclusion logic of
any kind (`timeMarks: TimeMark[]`, one unified list, replacing `hourMarks`/
`halfHourMarks`). Consecutive ticks become one grid row each — **not scaled
to real elapsed minutes**: a 3-hour gap with nothing scheduled in it and a
15-minute gap are both just "the next thing that happens," one row apiece.

This single change directly eliminates three previous mechanisms rather than
adapting them:
- **Elision** (`findElisionIntervals`/`compress`/`isElided`, the zigzag
  `elisionMarker`) — a long roomless break with nothing else scheduled
  during it now naturally collapses to one row, with no compression math
  and no "give up if another session overlaps the excess" edge case; that
  entire problem class doesn't exist once there's no compression happening.
- **Expansion** (`expandDanceScheduleTimeAxis`/`estimateCardExpansion.ts`)
  — row height was only being stretched to satisfy a *proportional* scale's
  promise that height ∝ duration; once that promise is gone, there's
  nothing left to defend by growing one card's row. A proper fix for card
  text overflow — rows that grow via native HTML/CSS sizing (e.g.
  `grid-auto-rows`/table-like natural height) instead of a JS heuristic
  layered on a fixed-height grid — is deliberately deferred future work,
  not reintroduced here. Accepted, explicit tradeoff: text may clip again on
  short/text-heavy cards in the interim — see `docs/known-issues.md`.
- **The conditional half-hour/off-grid-forcing rules and the bold/dim
  hierarchy** (immediately above) — superseded outright, not merely
  extended: under the new model every tick is *already* a real boundary, so
  there's nothing left to be conditional about, and no more hour-vs-half-
  hour distinction to visually draw (all labels render identically).

A useful emergent property, not something coded for directly: a single long
event in one room, while several separate shorter events run in *another*
room during that same span, naturally gets a taller `rowSpan` than any one
of the short ones — the other room's own boundaries are additional ticks
that land inside the long event's span, since ticks are shared across every
column, not per-room. See `computeDanceScheduleTimeAxis.test.ts`'s "spans
several other events" case, and the demonstration row added to
`content/test/data/dance-schedule.xlsx` (`scripts/edit-test-data.mjs`) for
live/visual review.

`computeDanceScheduleTimeAxis(visibleSessions)` also drops the `dateSessions`
parameter entirely — the axis was the only thing in `computeDanceScheduleLayout.ts`
that ever used it for anything beyond `deriveRoomOrder` (a separate, unrelated
concern that still needs the unfiltered list, unchanged). `computeDanceScheduleLevelLayout.ts`
never needed `dateSessions` for anything else in the first place (level
columns are filter-derived, not data-derived — see the "Level-columns view"
decision above), so it drops the parameter entirely too, along with the
`showGca` parameter both layout functions took solely to feed the now-deleted
expansion pass — `showGca` still reaches each grid component directly as its
own prop, purely to decide whether the `.gca` paragraph renders at all (see
the next decision for why that alone is now enough to size the row).

### Rows grow to fit real content, capped by a line-clamp instead of a track-level max
**Why:** The "axis is not a clock" decision above explicitly deferred a
proper fix for card text overflow — rows that grow via native HTML/CSS
sizing instead of a JS heuristic on a fixed-height grid — as future work,
accepting that a short/text-heavy card could clip in the interim (see
`docs/known-issues.md`). This closes that gap.

`DanceScheduleGrid.tsx`/`DanceScheduleLevelGrid.tsx`'s `gridTemplateRows`
changed from `repeat(N, <px>px)` (`ROW_HEIGHT_PX_WITH_GCA`/`WITHOUT_GCA`,
live-tuned constants) to `repeat(N, minmax(28px, auto))`: `auto` lets each
row size to the tallest content actually touching it — including correctly
distributing a row-spanning card's height need across the rows it spans,
standard CSS Grid track-sizing behavior, no JS involved — and the `28px`
floor keeps a row carrying only a time label (no card) from collapsing to a
cramped sliver. `showGca` no longer needs any JS-side row-height branching
at all: it just controls whether the `.gca` paragraph renders, and the row
auto-sizes to match.

Every row is a shared ordinal tick (the decision above), so unconstrained
growth was a real risk: one pathological card (e.g. a session listing ten
callers) growing its row would force every OTHER card sharing that row — in
every other room or level column — to stretch to match, even though their
own content is short. A `max-height` on the row *track* can't prevent that
without reintroducing clipping — a track's min-content floor wins over its
own max in CSS Grid's sizing algorithm, so if an item's unclamped content
needs more room than the max, the track grows past the max anyway. The cap
has to live on the *content* instead: `.levels`/`.details`/`.gca`
(`DanceScheduleGrid.module.css`) get a `-webkit-line-clamp`/`line-clamp` (2,
4, and 2 lines respectively — `.details` is the real risk area; the other
two are reliably short in practice but get a defensive clamp too) with
`overflow: hidden` and `text-overflow: ellipsis`. An element with
`overflow: hidden` reports its own clamped box height to the grid's track
sizing algorithm, not its unclamped content height, so a row never needs to
grow past what the clamp allows. Live-verified with a deliberately
pathological ten-caller test entry (`scripts/edit-test-data.mjs`, reverted
after checking): the card truncated cleanly at 4 lines with a visible "…",
and its row-sharing neighbors stayed their normal short height.

This removes the reason the "combine primary and details onto one line"
estimate existed at all — it only ever existed to dodge a *fixed* row
height, and there's no "will this fit?" decision left to make once ordinary
content sizes the row and pathological content is handled by the clamp
instead. Deleted rather than kept as a compactness optimization:
`src/lib/estimateCardFit.ts`, `estimateWrappedLineCount.ts`,
`measureTextWidth.ts` (all three, plus tests), `roomTextWidthPx`
(`computeDanceScheduleLayout.ts`), `levelTextWidthPx`
(`computeDanceScheduleLevelLayout.ts`), and the `combineLevelAndDetails`/
`combineRoomAndDetails` branches in both grid components — a card always
renders its level/room line and details line as two separate paragraphs
now. `danceScheduleCardSizing.ts` itself is deleted too: every constant it
exported (`ROW_HEIGHT_PX_WITH_GCA`/`WITHOUT_GCA`, `CARD_PADDING_PX`,
`CARD_HORIZONTAL_OVERHEAD_PX`, `DETAILS_MEASUREMENT_FONT`) existed only to
serve the now-deleted mechanisms. `levelColumnWidthPx`
(`computeDanceScheduleLevelLayout.ts`, actual per-lane column pixel width)
is unrelated and untouched.

Not unit-tested directly — jsdom (Vitest) doesn't run real CSS layout, so
neither intrinsic row growth nor line-clamp truncation can be asserted by a
unit test. The `DanceScheduleGrid.test.tsx`/`DanceScheduleLevelGrid.test.tsx`
tests that used to assert a specific `showGca`-driven pixel value (parsed
out of the JS-computed `gridTemplateRows` string) or specific combine
behavior were replaced with tests that only confirm the track-sizing
function's shape (`minmax(\d+px, auto)`) and that level/room and details
always render as two separate lines — real coverage for the growth/clamp
behavior itself is the live verification described above. A Playwright e2e
test would be the natural next step for durable regression coverage; not
added here since Playwright can't be run from this project's sandbox to
validate it.

### Caller-columns view: a third grid, headline callers as columns, skipping sessions with no caller

**Why:** Alongside room-columns and level-columns, some users want to scan a
single caller across the whole day — "what is Vic Ceder doing all day?" —
which neither prior view answers directly. A third page (`/dance-by-caller`,
`DanceScheduleCallersPage.tsx`) reuses the exact same date/level-range/GCA
selectors and the exact same `useDanceScheduleFilters` hook as the other
two, unchanged, so switching between all three views keeps the same
selection. "Headline caller" means `session.callers` specifically — `gca` is
already a distinct field the column-derivation step simply never reads, so
excluding it needed no new code at all.

**Columns are data-derived, like rooms, not filter-derived like levels, but
ordered alphabetically by first name — not appearance order, and not
configurable like the room view's own order (see "Room columns" below):**
callers are free text with no fixed vocabulary, so `computeDanceScheduleCallerLayout.ts`
discovers *which* callers get a column the same way `deriveRoomOrder`
discovers rooms — walking `dateSessions`, collecting each structured
session's `callers` — but unlike rooms, their *order* is a fixed product
rule, not spreadsheet position: sorted by first name (`firstNameOf`, the
string up to the first space) via `localeCompare`, tiebroken by full name for
the rare case of two callers sharing a first name (never observed in real or
test data, but keeps the result deterministic rather than depending on `Set`
iteration order). Column membership is still filtered to callers actually
present in `visibleSessions`, same as before — only the ordering rule
changed. This keeps the column set stable as the level range narrows, same
guarantee the room view already provides.

**A session with no caller is skipped entirely, not floated or given a
dedicated "Other" column:** a freeform session (e.g. a lunch break, or the
"Country Western Dance" entry the level view's own `OTHER_LEVEL_SLOT` was
built for) has no `callers` field at all. Both other views give a
"doesn't fit my axis" session somewhere to go — the room view floats a
roomless session across every room, the level view floats a roomless
session or gives a real-room-but-no-level session a dedicated `"Other"`
column. This view does neither: per direct product decision, a session with
no caller simply isn't part of "what is this caller doing all day" and is
dropped before layout even begins — `computeDanceScheduleCallerLayout`
filters `visibleSessions` down to `kind === 'structured'` sessions before
doing anything else, including before computing the shared time axis, so a
skipped session contributes no column, no placement, and no time-axis row
(a lunch break's time range simply doesn't appear on this page at all).
This is the one place this view's design deliberately doesn't mirror either
prior view's precedent, rather than extending it.

**"GCA Caller Showcase Dance" sessions are omitted entirely, and a caller
needs more than 3 hours to get a column at all:** both per direct product
decision, not something derived from the room/level views' own precedent.
A showcase dance credits a caller but isn't representative of what they
normally do, so it's excluded up front (`GCA_CALLER_SHOWCASE_EVENT_TYPE`,
via the shared `isEligibleCallerSession` guard) — before column derivation,
before hour-totaling, before anything else — rather than just hidden on the
card the way `showGca` hides the subordinate GCA line elsewhere.
`MIN_CALLER_HOURS` (3, computed via the shared `sessionHours` helper also
used by the debug-page hour summary above) then drops any caller whose
remaining (non-showcase) hour total across the WHOLE EVENT (every date, not
just the one selected) is 3 or under. **Deliberately computed from
`allSessions` (every date, unfiltered), not `dateSessions`/`visibleSessions`**
— a caller's eligibility for a column at all must stay as stable across the
level filter AND the selected date as their column's *order* already is
across the level filter (see "Columns are data-derived" above), even though
which of their sessions are actually drawn still reacts to both normally.
Computing the threshold from the filtered set instead was a real shipped
bug: a caller with, say, 3 one-hour sessions inside a narrow level range
plus a 4th one-hour session just outside it has a wider total of 4 hours (a
real column), but an in-range total of only 3 (at the threshold, not over
it) — narrowing the level range to exclude that 4th session made the
caller's *entire* column vanish, including their still-in-range sessions,
purely because the range had narrowed. Originally computed per-day rather
than event-wide, which had an analogous problem across dates instead of
across the level filter: a real caller with several 1-hour sessions spread
across different days, each day individually under the threshold, never got
a column on any day even though their event-wide total cleared it —
confirmed against real production data and changed to sum `allSessions`
instead, per direct product decision. A co-taught session splits its
duration evenly across its distinct callers (same convention as the
debug-page hour summary's own even split) rather than crediting each with
the full session, so it's possible for a co-taught session's identical card
to appear under only one of its two callers' columns, if just one of them
clears the threshold on their own.

**A caller's column visibility is still a two-part check, same shape as the
room view's own order-vs-visibility split:** clearing `MIN_CALLER_HOURS`
event-wide makes a caller *eligible*, but they also need at least one
session in the current date's level-filtered `visibleSessions` to actually
show a column — an eligible caller with nothing visible right now would
otherwise render as a pointless empty column. `visibleCallers` is
`callerOrder` filtered by BOTH the event-wide hour total AND membership in
a `visibleCallerSet` built from the filtered sessions, mirroring exactly how
the room view's `visibleRoomSet` (filter-reactive) narrows `roomOrder`
(already computed globally across every date, same stability precedent this
followed).

**No contiguous-span merge, unlike either other view:** a multi-room or
multi-level session gets one wide spanning placement when its columns are
adjacent. Two arbitrary callers' column positions (alphabetical-by-first-name
order) carry no such adjacency meaning, so a co-taught session (e.g. "Michael
Kellogg & Terri Sherrer," real data) instead gets its identical card placed
independently in each of its callers' own columns — always `columnSpan: 1`,
per direct product decision ("one column per caller," not a combined "A & B"
column and not a spanning merge). This drops the entire
`isContiguous`/conflict-free-merge branch the other two layout functions
need, making this one structurally the simplest of the three.

**Lane assignment extracted to `src/lib/assignLanes.ts` at its second
consumer:** a single real caller can't double-book themselves except via a
genuine data-entry error, so overlap lanes here are a defensive safety net
rather than something realistically exercised (contrast the level view,
where same-level overlap is common and expected). Still, it's the exact
same greedy interval-scheduling algorithm the level view already had
(`assignLanes`/`assignLanesPerSlot`, generalized to a `LaneEntry` interface)
— extracted into a shared file at exactly its second consumer, mirroring
this doc's own `computeDanceScheduleTimeAxis.ts` precedent (also extracted
at its second consumer, also deliberately ignorant of domain-specific
fields). `computeDanceScheduleLevelLayout.ts` now imports from this shared
file instead of defining its own copy — pure refactor, no behavior change.

**Cards show level(s) and room, never the caller** (already implied by the
column) — `.levels` line first, plain, same as the room view; `.details`
line second, event-type-prefix + bold **room** (`detailsWithRoomContent`, a
new sibling of `detailsContent` in `danceScheduleCardContent.tsx` bolding
`formatSessionRoom` instead of `formatSessionCallers`); the existing
optional GCA line unchanged. Since every placement here is guaranteed
`kind === 'structured'` (freeform sessions are filtered out before layout
runs), this grid needs no roomless-card treatment at all, unlike the other
two — every card renders as an ordinary single-column card, even one whose
own `location.kind === 'roomless'` (still lands under its real caller's
column; `formatSessionRoom` just renders `"—"` for it, no special-casing
needed).

**Idle rows are dropped entirely, not just capped at one row apiece:**
`computeDanceScheduleTimeAxis.ts`'s "axis is not a clock" model already
collapses any gap — however long — to exactly one row, for every view. A
caller's own sessions are sparse enough (a handful out of dozens of daily
slots) that even that one row per gap adds up to real, avoidable dead
space, unlike the room/level views where something is almost always
running somewhere. `compressToOccupiedRows` (in
`computeDanceScheduleCallerLayout.ts`, scoped to this view only) removes
any row with no placement in any visible caller column at all: for each
original row-boundary, only the boundary that *opens* an occupied row
survives as a label — the boundary that would merely mark "a gap starts
here" is dropped outright, while the boundary marking "real content
resumes here" is always kept (so no information about when the *next*
thing happens is lost, only about when the gap itself began). This is safe
against ever colliding two labels on one row: a dropped boundary simply
renders no `<div>` at all, it never shares a row with a kept one. The very
last boundary (the end of the day's final session) is always kept as an
explicit invariant, stated directly in code rather than left to be true
only by construction (it would never actually get dropped by the ordinary
rule anyway, since the row right before it is always occupied by that
final session itself).

**The empty-filter-results message links back to "show all levels"** on
all three views, not just this one — `DanceScheduleGrid`/
`DanceScheduleLevelGrid`/`DanceScheduleCallerGrid` all take a new
`onShowAllLevels: () => void` prop (each page supplies
`() => setLevelRange(0, slots.length - 1)`), rendered as a `<button>`
styled like an inline text link (`.emptyLink` in
`DanceScheduleGrid.module.css`) rather than a real `<a>`, since it resets
filter state instead of navigating anywhere.

### Sticky-scroll grid shell extracted at its third consumer

**Why:** a review of visual/styling sharing across all three views (once
all three existed) found that while the CSS module and color/formatting
helpers were already properly shared, the two-grid sticky-scroll
*mechanics* — `headerRef`/`bodyRef`, the scroll-mirroring handler, the
callback-ref re-attachment, and the reset-on-layout-change effect — plus
the surrounding wrapper/grid JSX (`panelWrapper`/`headerWrapper`/`corner`/
column headers/`bodyWrapper`) had been copy-pasted verbatim into all three
grid components (`DanceScheduleGrid.tsx`, `DanceScheduleLevelGrid.tsx`,
`DanceScheduleCallerGrid.tsx`) rather than extracted, unlike the layout-
computation side (`assignLanes.ts`, `computeDanceScheduleTimeAxis.ts`) —
roughly 70 lines duplicated three times over. Fixed by extracting:

- `src/hooks/useSyncedGridScroll.ts` — `headerRef`/`setBodyRef`/the scroll-
  mirror handler/the reset effect, taking a `resetKey` (each grid passes
  its own `layout`, exactly as before).
- `src/components/StickyScrollGrid.tsx` — the wrapper markup itself,
  parameterized by `columns` (`{ key, title, label }[]`),
  `gridTemplateColumns`, `totalRows`, `emptyCells`, `timeMarks`, and
  `resetKey`, with `children` left for each grid's own placement/
  `SessionCard` rendering — the one part that's genuinely different per
  view (roomless handling, lane math, `levelPrefix`, which `detailsContent`
  variant).

Unlike `assignLanes.ts`/`computeDanceScheduleTimeAxis.ts` (extracted at
their *second* consumer), this one waited until a third existed and a
dedicated review flagged it — a reminder that "how many consumers" isn't
self-enforcing; duplicated shell code doesn't announce itself as loudly as
a duplicated algorithm does. Pure refactor, no behavior change — all three
grids' existing tests pass unchanged, plus a new
`useSyncedGridScroll.test.ts` for the extracted hook directly (mirroring
this codebase's own convention of testing hooks directly, e.g.
`useDanceScheduleFilters.test.ts`); `StickyScrollGrid.tsx` itself has no
dedicated test file, relying on its three consumers' existing coverage,
matching the precedent already set by `assignLanes.ts` (extracted, shared,
but only tested through its own consumers).

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
