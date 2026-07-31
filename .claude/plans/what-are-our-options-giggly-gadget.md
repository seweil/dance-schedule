# Drop the linear time-proportional axis; label only real event boundaries

## Context

Two rounds of incremental fixes to the sticky time column this session
(conditional half-hour labels, off-grid boundary forcing, bold/dim visual
hierarchy) still landed as "too technical" per live feedback. The real
problem isn't any one of those details — it's the underlying model: a fixed
clock grid (hour/half-hour positions) with special-case logic bolted on to
patch its edge cases (elision to compress dead time, expansion to grow rows
for overflowing text, off-grid forcing to cover :15/:45 boundaries). Each
patch was locally justified but the sum reads as complex machinery for what
should be a simple idea.

The reset, per explicit direction: **the vertical axis is not a clock at
all.** It's just the ordered sequence of distinct times some currently-
visible event actually starts or ends at. Every tick is, by construction, a
real event boundary — so every tick gets a label, always (no more
conditional-inclusion logic of any kind). Consecutive ticks become one grid
row each, **not scaled to real elapsed minutes** — a 3-hour gap with nothing
scheduled in it and a 15-minute gap are both just "the next thing that
happens," one row apiece. This single change is what eliminates the elision
mechanism entirely (a long roomless break with nothing else scheduled during
it now naturally collapses to one row — no compression math needed, no
zigzag "scale break" marker needed) and removes the motivation for the
expansion mechanism too (row height was only being stretched to satisfy a
*proportional* scale's promise that height ∝ duration; once that promise is
gone, there's nothing to defend by growing a row for one card's text). A
proper fix for card text overflow — rows that grow via native HTML/CSS
sizing (e.g. `grid-auto-rows`/table-like natural height) instead of a JS
heuristic layered on a fixed-height grid — is explicitly future work, not
this change. Confirmed with the user: text may clip again on short/text-
heavy cards in the interim; this is an accepted, documented tradeoff, not an
accidental regression.

Also confirmed with the user: since every label is now equally "a real event
boundary," there's no more primary/secondary distinction to draw — all
labels render with the same (non-bold) visual weight. The bold-hour/dim-
half-hour hierarchy shipped earlier this session is being reverted as part
of this same change.

## Rewrite vs. edit, per file

Asked explicitly, so answering directly rather than defaulting to
edit-in-place everywhere:

- **`src/lib/computeDanceScheduleTimeAxis.ts` and its test** — full rewrite
  (the `Write` tool, not incremental `Edit`s). The new function shares
  almost nothing structurally with the old one beyond `hourFormatter` and
  `isContiguous` — trying to surgically edit ~330 lines of elision/expansion
  machinery down to ~25 lines is harder to get right and harder to review
  than just writing the new, much smaller file directly.
- **`src/lib/computeDanceScheduleLayout.ts` / `computeDanceScheduleLevelLayout.ts`**
  — targeted edits. Most of each file (room derivation, column placement,
  the entire lane-assignment/overlap subsystem in the level-layout file) is
  completely untouched by this change; only the axis-call/expansion-pass/
  field-naming parts move. A full rewrite here would risk introducing new
  bugs in logic that doesn't need to change at all.
- **`src/components/DanceScheduleGrid.tsx` / `DanceScheduleLevelGrid.tsx`**
  — targeted edits, same reasoning (scroll-sync, empty-state, card
  rendering/combine-text logic are all untouched; only the marks-render
  block, the elision-marker block, and the `unitHeightPx`→`rowHeightPx`
  rename move).

## Stress case: one event spanning the duration of several other events

Explicitly designed for, and worth spelling out since it's the real test of
whether the ordinal model behaves sensibly: a single long event in one room
(say 9:00–12:00) while several separate shorter events happen in *another*
room during that same span (say three back-to-back 1-hour sessions,
9–10/10–11/11–12). The long event's own start/end contribute 2 ticks; the
other room's sessions contribute 2 more *distinct* ticks strictly between
them (10:00, 11:00) — ticks are global across every column, not per-room.
So the long event's `rowSpan` naturally comes out to 3 (it covers 3 row-
steps: 9→10, 10→11, 11→12), while each of the other room's sessions gets
`rowSpan` 1. This is the entire point of dropping the linear scale: the long
card ends up visibly taller than any one of the short cards, in rough
proportion to how much *else* was happening during it — without any special-
casing, purely as a consequence of ticks being shared across all columns.
No code change beyond the core rewrite above is needed to handle this
correctly; it falls out of the design automatically. It gets a dedicated
unit test in the rewritten `computeDanceScheduleTimeAxis.test.ts` (this is
core correctness for the rewrite itself, not the deferred "automated test"
mentioned below — that refers to the *sample-data* scenario next).

**Making it visible for manual review:** this exact shape doesn't exist in
any current content set's data, so add one to `content/test/data/dance-schedule.xlsx`
(the deliberately edge-case-flavored fixture set — not `automated-testing`,
which both unit and e2e tests assert against directly and shouldn't gain new
data as a side effect of this change). Plan: add a new room column ("Test
Room D") to the existing Tuesday sheet with a single row —
time range `9:00a-12:00p`, cell `Plus : Long Workshop - Test Caller Eight`
— alongside the sheet's existing three separate 1-hour rows in its other
rooms (9-10/10-11/11-12, already present per the current dump). No merged
cells needed: confirmed via `parseDanceScheduleSheet.ts` that each row
carries its own independent time range per `parseTimeRange`, and every
room's cell in that row shares it — a longer session is simply a row whose
own time range is longer, not a cross-row merge.

No xlsx-writing library exists in this repo today (`read-excel-file` is
read-only). Per explicit direction, add `exceljs` as a real devDependency
(not a throwaway `npx` call) — future sessions will use it again to build
out more test-data scenarios, so it's worth keeping installed rather than
re-fetching each time. Write a small, kept (not deleted) script —
`scripts/edit-test-data.mjs` — that loads `content/test/data/dance-schedule.xlsx`,
confirms the Tuesday sheet's actual current header/room layout first (don't
guess), and appends the header cell + one data row for this scenario.
Structure it so it's easy to extend with the next scenario later (e.g. a
small array of `{ sheet, room, timeRange, cellText }` additions applied in
one pass), rather than a one-off hardcoded edit. Verify by rebuilding
(`pnpm build`) and diffing the auto-generated
`content/test/data/dance-schedule-dump.md` — same verification pattern
already established in this project's history for xlsx edits — plus a live
visual check per the Verification section below. Per explicit direction,
this sample-data scenario is for manual/visual review only right now — no
new automated test asserts against it yet ("in the future we will add to
automated tests").

## Design

**New row model**, replacing `computeDanceScheduleTimeAxis.ts` almost
entirely:

```ts
export interface TimeMark {
  rowStart: number
  label: string
}

export interface DanceScheduleTimeAxis {
  totalRows: number
  timeMarks: TimeMark[]
  rowStartFor: (time: Date) => number
  rowSpanFor: (start: Date, end: Date) => number
}

export function computeDanceScheduleTimeAxis(
  visibleSessions: DanceSession[],
): DanceScheduleTimeAxis | null {
  if (visibleSessions.length === 0) return null
  const tickTimes = [
    ...new Set(visibleSessions.flatMap((s) => [s.startTime.getTime(), s.endTime.getTime()])),
  ].sort((a, b) => a - b)
  const rowIndexByTime = new Map(tickTimes.map((t, i) => [t, i]))
  const rowStartFor = (time: Date): number => rowIndexByTime.get(time.getTime())! + 1
  const rowSpanFor = (start: Date, end: Date): number =>
    Math.max(1, rowStartFor(end) - rowStartFor(start))
  const timeMarks = tickTimes.map((t, i) => ({ rowStart: i + 1, label: hourFormatter.format(new Date(t)) }))
  return { totalRows: tickTimes.length - 1, timeMarks, rowStartFor, rowSpanFor }
}
```

Key properties, all direct consequences of this one change:
- **Single `visibleSessions` param** (not `dateSessions` + `visibleSessions`)
  — "as currently filtered" means the axis only ever reflects what's
  actually shown. `dateSessions` stays a parameter of the *layout* functions
  (still needed by `deriveRoomOrder`, an unrelated, unchanged concern), just
  no longer threaded into the time-axis call itself.
- **Every session boundary is, by construction, a tick** — the whole
  conditional-inclusion / off-grid-forcing apparatus from the last two
  rounds becomes dead code and is deleted, not adapted.
- **Two sessions sharing an exact boundary** (e.g. one ends when another
  starts) dedupe for free via the `Set`, same one shared row.
- **A long gap with nothing scheduled** (the old elision case) is just one
  row — `findElisionIntervals`/`compress`/`isElided`/the whole
  `MAX_ROOMLESS_VISIBLE_*` concept and the zigzag `elisionMarker` are
  deleted, not reworked. No "give up if another session overlaps the
  excess" edge case either — that entire problem class doesn't exist once
  there's no compression happening.
- **`totalRows`/`timeMarks`** rename `totalRowUnits`/(`hourMarks` +
  `halfHourMarks` merged into one list) — the old names describe a
  15-minute-unit clock grid that no longer exists.
- **`rowStartFor`/`rowSpanFor` keep their exact call-site shape** — every
  caller in `computeDanceScheduleLayout.ts`/`computeDanceScheduleLevelLayout.ts`
  still just calls them with a session's real start/end `Date`; only the
  math inside changes. This is what keeps the blast radius to "delete a
  chunk + rename fields" rather than "redesign every caller."

## Implementation

### `src/lib/computeDanceScheduleTimeAxis.ts`
Replace with the design above. Delete: `floorToHour`/`ceilToHour`,
`trimEmptyDayEdges`, `ElisionInterval`/`findElisionIntervals`, `compress`,
`isElided`, `isHourAligned`/`isHalfHourAligned`, `RowExpansion`,
`DanceScheduleTimeAxisExpansion`, `expandDanceScheduleTimeAxis`,
`UNIT_MINUTES`/`UNIT_MS`/`MAX_ROOMLESS_VISIBLE_*`/`MS_PER_HALF_HOUR`. Keep:
`hourFormatter` (still the right "h:mm a" format for a real timestamp),
`isContiguous` (column-index contiguity check, unrelated to time at all).

### `src/lib/estimateCardExpansion.ts` + its test — delete entirely
Nothing calls `estimateCardRowExpansion` once the expansion pass is gone.

### `src/lib/estimateCardFit.ts`
Revert to its pre-expansion shape: drop `CardFitEstimate`/`neededHeightPx`
and the "estimate the combined arrangement's real height" branch — nothing
will consume it once `estimateCardExpansion.ts` is deleted. Collapse back to
a single `shouldCombinePrimaryAndDetails(inputs, measureWidth): boolean`
export (matching this file's shape before the expansion feature added
`estimateCardFit`/`neededHeightPx` on top of it). `estimateWrappedLineCount.ts`/
`measureTextWidth.ts` are untouched — confirmed fully self-contained, no
elision/expansion/row coupling at all.

### `src/lib/danceScheduleCardSizing.ts`
Rename `UNIT_HEIGHT_PX_WITH_GCA`/`UNIT_HEIGHT_PX_WITHOUT_GCA` →
`ROW_HEIGHT_PX_WITH_GCA`/`ROW_HEIGHT_PX_WITHOUT_GCA` — same values (20/18),
not asked to change the actual sizing, just the now-inaccurate "per 15-min
unit" framing. Update the file's doc comment accordingly. Other three
constants (`CARD_PADDING_PX`, `CARD_HORIZONTAL_OVERHEAD_PX`,
`DETAILS_MEASUREMENT_FONT`) untouched.

### `src/lib/computeDanceScheduleLayout.ts`
- Drop `expandDanceScheduleTimeAxis`/`RowExpansion`/`estimateCardRowExpansion`
  imports, the whole `collectRowExpansions` function, and the
  expansion/remap pass at the end of `computeDanceScheduleLayout` —
  placements use `timeAxis.rowStartFor`/`rowSpanFor` output directly now,
  no second pass.
- `computeDanceScheduleTimeAxis(dateSessions, visibleSessions)` call becomes
  `computeDanceScheduleTimeAxis(visibleSessions)`.
- `DanceScheduleLayout`: drop `elisionMarkers`/`expansionMarkers`; replace
  `hourMarks`/`halfHourMarks` with `timeMarks: TimeMark[]`; rename
  `totalRowUnits` → `totalRows`. `EMPTY_LAYOUT` updated to match.
- `unitHeightPx` local var and the `UNIT_HEIGHT_PX_WITH_GCA`/`WITHOUT_GCA`
  import rename to `rowHeightPx`/`ROW_HEIGHT_PX_WITH_GCA`/`WITHOUT_GCA`.

### `src/lib/computeDanceScheduleLevelLayout.ts` — same shape of changes
Confirmed via full read: this file's lane-assignment subsystem
(`RawEntry`/`buildRawEntries`/`assignLanes`/`assignLanesPerSlot`/
`computeColumnWidthsPx`/`mergeIntoPlacements`) does interval-overlap
detection purely via row-range comparison (`rowStart`/`rowSpan`) — it has no
coupling to *what a row represents*, so it needs **zero logic changes**,
only the same mechanical renames/deletions as the room-layout file:
drop `collectRowExpansions`/expansion pass; single-param time-axis call;
`DanceScheduleLevelLayout` drops `elisionMarkers`/`expansionMarkers`, gets
`timeMarks: TimeMark[]` in place of `hourMarks`/`halfHourMarks`,
`totalRowUnits` → `totalRows`; `unitHeightPx` → `rowHeightPx` throughout.
`levelColumnWidthPx`/`levelTextWidthPx`/`LEVEL_COLUMN_WIDTH*`/`OTHER_LEVEL_SLOT`
all untouched — column/level concerns, orthogonal to the row-axis rework.

### `src/components/DanceScheduleGrid.tsx` / `DanceScheduleLevelGrid.tsx`
- Replace the separate `hourMarks.map(...)` + `halfHourMarks.map(...)`
  blocks with one `timeMarks.map((mark) => <div className={styles.timeLabel} ...>)`
  — uniform styling, no `.halfHourLabel` modifier class used anymore.
- Delete the `elisionMarkers.map(...)` render block entirely (both files —
  confirmed identical in each).
- `layout.totalRowUnits` → `layout.totalRows` in the `gridTemplateRows`
  computation; `unitHeightPx` variable/prop renames to `rowHeightPx`
  throughout both components (incl. `SessionCard`'s prop in each file).
- `DanceScheduleLevelGrid.tsx`'s lane-aware width/`levelTextWidthPx` logic,
  `levelPrefix` handling, and `formatSessionRoom`-as-primary-text are all
  unrelated to the row-axis and stay exactly as they are.

### `src/components/DanceScheduleGrid.module.css`
- Delete `.elisionMarker` and `.halfHourLabel` entirely.
- `.timeLabel`: remove `font-weight: 600` (back to normal/default weight —
  confirmed no more bold/dim hierarchy).

### Tests
- **`src/lib/computeDanceScheduleTimeAxis.test.ts`** — full rewrite around
  the new model: tick set = union of visible sessions' start/end times;
  every tick gets a label (no conditional cases to test anymore — that's
  the point); two sessions sharing a boundary dedupe to one row; a
  concurrent session in another room correctly shares rows via its own
  start/end being separate ticks; a long isolated roomless gap collapses to
  one row with no marker at all; empty `visibleSessions` → `null`. Every
  `expandDanceScheduleTimeAxis`-describe-block test is deleted (function no
  longer exists).
- **`src/lib/estimateCardExpansion.test.ts`** — delete.
- **`src/lib/estimateCardFit.test.ts`** — drop the `neededHeightPx`-specific
  cases added for the expansion feature; keep the `combine`-decision tests
  (rename call sites to `shouldCombinePrimaryAndDetails` if `estimateCardFit`
  itself is removed as an export).
- **`src/lib/computeDanceScheduleLayout.test.ts`** /
  **`computeDanceScheduleLevelLayout.test.ts`** — every existing fixture's
  hardcoded `rowStart`/`rowSpan`/`totalRowUnits` numbers need hand
  recomputation under the new ordinal model (they're no longer 15-minute-
  unit-based) — same careful, case-by-case arithmetic as this session's
  earlier half-hour-label rewrite, not a mechanical rename. Drop every
  elision/expansion-specific test case; rename fields throughout.
- **`src/components/DanceScheduleGrid.test.tsx`** /
  **`DanceScheduleLevelGrid.test.tsx`** — update `makeLayout()` fixtures
  (`timeMarks` instead of `hourMarks`/`halfHourMarks`, drop
  `elisionMarkers`/`expansionMarkers`); delete the elision-marker-render and
  half-hour-label-modifier-class tests; the "renders header/body content in
  separate grids" style tests stay, just referencing `timeMarks`.
- e2e specs (`e2e/dance-schedule.spec.ts` etc.) — confirmed no test
  references row internals, elision, or expansion by name or behavior. No
  changes expected, but re-run mentally against the new label set (every
  spec that asserts visible text/labels should still hold since real event
  boundaries are a superset of what used to show).

### Docs
- **`docs/design/dance-schedule.md`** — do not delete the elision (lines
  ~492–555) or expansion (~557–603) decision sections, or the half-hour-
  labels section added earlier this session — per this doc's own living-
  history convention (it already narrates an abandoned first elision
  attempt without deleting that narrative). Instead add one new decision
  entry at the end explicitly marking all three as **superseded** by the
  ordinal-row model, with a one-paragraph pointer explaining why each
  became unnecessary (mirrors the reasoning in this plan's Context above).
- **`docs/known-issues.md`** — update the "Dance-schedule cards: long
  wrapping text clips on very short (~30min) sessions" entry: the "Fix
  shipped (2026-07-30)" axis-stretch mitigation this entry currently
  documents is being removed. Add a note that clipping may reappear on
  short/text-heavy cards as a deliberate, accepted tradeoff pending the
  future "grow rows via native HTML/CSS sizing" work — not a silently
  reintroduced bug.
- **`docs/design/dance-schedule-mobile-scroll.md`** — confirmed no
  elision/expansion content; only the row-index `+1`-offset convention
  section is tangentially related. Spot-check it still reads correctly
  (it should — that convention is about header-row offset, not about what
  a row numerically represents) and fix any stale `.halfHourLabel`
  reference if the earlier session's cleanup missed one there.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` must pass, including every
  rewritten test above.
- Live-verify via `pnpm dev` + `claude-in-chrome` against real data:
  every visible session's start/end shows a label, uniformly styled (no
  bold/dim difference); a long roomless break (e.g. "Dinner Break") renders
  compactly with no zigzag marker at all, just naturally small since
  nothing else is scheduled during it; concurrent sessions in different
  rooms still align on shared rows (same-time events line up horizontally);
  narrowing the level filter changes which labels show, matching "as
  currently filtered." Check both `/dance-schedule` and `/dance-by-level`.
  Note and screenshot at least one case where a short session's text now
  clips (expected, documented tradeoff) so the known-issues.md update is
  grounded in a real example, not just theory.
- Against `content/test/data/dance-schedule.xlsx` specifically (`pnpm dev:test`):
  confirm the new "Test Room D" long-workshop card visibly spans multiple
  rows, aligned correctly against the other room's three separate 1-hour
  cards at each shared tick — this is the case the user will visually
  evaluate directly, so get a screenshot of it, not just a pass/fail note.

## Critical files

- `src/lib/computeDanceScheduleTimeAxis.ts` — near-total rewrite
- `src/lib/estimateCardExpansion.ts` (+ test) — delete
- `src/lib/estimateCardFit.ts` (+ test) — revert to pre-expansion shape
- `src/lib/danceScheduleCardSizing.ts` — rename UNIT_HEIGHT_PX_* → ROW_HEIGHT_PX_*
- `src/lib/computeDanceScheduleLayout.ts` / `computeDanceScheduleLevelLayout.ts` — drop expansion pass, rename fields
- `src/components/DanceScheduleGrid.tsx` / `DanceScheduleLevelGrid.tsx` — unify timeMarks render, drop elision marker
- `src/components/DanceScheduleGrid.module.css` — delete `.elisionMarker`/`.halfHourLabel`, un-bold `.timeLabel`
- `src/lib/computeDanceScheduleTimeAxis.test.ts` / `computeDanceScheduleLayout.test.ts` / `computeDanceScheduleLevelLayout.test.ts` / `DanceScheduleGrid.test.tsx` / `DanceScheduleLevelGrid.test.tsx` — extensive rewrite
- `docs/design/dance-schedule.md` / `docs/known-issues.md` / `docs/design/dance-schedule-mobile-scroll.md` — doc updates
- `content/test/data/dance-schedule.xlsx` — add the "one long event spans several others" demo scenario
- `scripts/edit-test-data.mjs` (new, kept for future scenarios) + `package.json` (`exceljs` devDependency)
