# Dance-schedule-by-level view

## Context

The dance-schedule page (`/dance-schedule`) currently renders one grid: rooms as
columns, time as rows, with each cell showing the session's **level** (bold) +
event/caller details. The user wants a second view of the *same* data — same date
picker, same level-range slider, same GCA toggle, same underlying sessions — but
with **level slots as columns** instead of rooms. Cell content flips accordingly:
each cell shows the **room** (bold) + event/caller details, since level is now
implied by the column. This should honor the existing `combineA1A2` per-content-set
flag (A1/A2 merge into one column, same as they already merge into one slider stop).

The one genuinely new problem: a room is exclusive real estate (today's algorithm
never has two sessions in the same room at overlapping times, confirmed via
codebase-wide search — no overlap handling exists anywhere), but a **level** is not
exclusive — two different sessions in different rooms can share a level at
overlapping times. The user confirmed this needs real handling, even though rare.

## Design decisions

Confirmed with the user:

1. **Overlap rendering**: side-by-side sub-columns within a level's column, sized
   and positioned by each session's actual time extent (calendar-day-view style),
   not simple stacking-in-one-cell. Needs a new interval/lane-assignment algorithm.
2. **Sessions with no ordered level** (freeform/roomless entries like "Lunch Break",
   or structured sessions tagged only `Advanced`/`Intro`/`Various` — not in
   `LEVEL_ORDER`): float across the full width of all visible level columns, exactly
   like roomless sessions already float across all visible room columns today.
3. **Card coloring**: keep coloring by level (`colorForSession`, unchanged) even
   though it's visually redundant with the column in this view — simpler, no new
   room→color mapping needed.

Decided unilaterally (low-ambiguity, stated here for review rather than asked):

- **Column set is the filter range, always fully shown**: unlike rooms (data-derived,
  hidden when empty), level columns are `getLevelSlots(combineA1A2).slice(minLevelIndex,
  maxLevelIndex + 1)` — exactly the slots currently selected by the level slider,
  shown even if a given day has zero sessions at that level. The level range slider
  becomes a direct column-range picker in this view, which is a natural, desirable
  simplification versus the room view's derived-visibility logic.
- **Shared filter state**: the new page calls the *same* `useDanceScheduleFilters`
  hook (same `localStorage` key) as the room page, so switching between the two
  views keeps the same date/level-range/GCA selection rather than resetting it.
- **Overlap simplification for the doubly-rare compound case**: a multi-level
  session (today only ever 2 adjacent levels, e.g. `C1, C2`) that *also* conflicts
  with another session in one of its columns loses its wide visual span for that
  occurrence and renders as separate per-column blocks instead (see algorithm below).
  This case has never been observed in real or test data; not worth the complexity
  of true 2D rectangle packing.

## Existing code being reused as-is

- `DanceScheduleFilters.tsx` — already fully generic/presentational (no room/layout
  coupling). Reused unchanged.
- `filterDanceSessions.ts`, `levelOrder.ts` (`LEVEL_ORDER`, `LevelSlot`,
  `getLevelSlots`, `isSessionInLevelRange`, `isOrderedLevel`) — unchanged.
- `estimateCardFit.ts`, `estimateWrappedLineCount.ts`, `measureTextWidth.ts` — the
  card-overflow "combine primary + details onto one line" heuristic is already
  axis-agnostic; only a naming tweak (below) makes that explicit.
- `formatSessionRoom`, `formatSessionGca`, `formatSessionEventTypePrefix`,
  `formatSessionCallers`, `formatSessionTimeRange` (`formatDanceSession.ts`) —
  `formatSessionRoom` already exists and is exactly what the new view's bold label
  needs.
- `colorForSession` (`levelColors.ts`) — unchanged, per decision 3.

## New/changed files

### 1. `src/lib/computeDanceScheduleTimeAxis.ts` (new — extracted shared logic)

Pulls the genuinely axis-agnostic half of `computeDanceScheduleLayout.ts` out into
a shared module, since the new level layout needs identical time-row math:
`floorToHour`/`ceilToHour`, `trimEmptyDayEdges`, `rowStartFor`/`rowSpanFor`,
hour-mark/half-hour-mark generation, and the `HourMark` type. Also relocates the
tiny `isContiguous(sortedIndices: number[])` helper here (used by both the
room-span and level-span logic). Exports something like:

```ts
export function computeDanceScheduleTimeAxis(
  dateSessions: DanceSession[],
  visibleSessions: DanceSession[],
): {
  totalRowUnits: number
  hourMarks: HourMark[]
  halfHourMarks: number[]
  rowStartFor: (time: Date) => number
  rowSpanFor: (start: Date, end: Date) => number
} | null // null when dateSessions is empty (today's EMPTY_LAYOUT case)
```

`computeDanceScheduleLayout.ts` is refactored to call this instead of its own
private copies — pure internal refactor, its own tests should pass unmodified
(re-run to confirm).

### 2. `src/lib/computeDanceScheduleLevelLayout.ts` (new)

Mirrors `computeDanceScheduleLayout.ts`'s shape and role, but columns = level
slots instead of rooms:

```ts
export interface DanceLevelSessionPlacement {
  session: DanceSession
  rowStart: number
  rowSpan: number
  columnStart: number   // 0-based index into visibleSlots
  columnSpan: number
  lane: number           // 0-based sub-column index for overlapping sessions
  laneCount: number      // how many lanes this placement's column is split into
                          // for its row range (1 = full width, no conflict)
}

export interface DanceScheduleLevelLayout {
  visibleSlots: readonly LevelSlot[]
  totalRowUnits: number
  hourMarks: HourMark[]
  halfHourMarks: number[]
  placements: DanceLevelSessionPlacement[]
}

export function computeDanceScheduleLevelLayout(
  dateSessions: DanceSession[],
  visibleSessions: DanceSession[],
  slots: readonly LevelSlot[],
  minLevelIndex: number,
  maxLevelIndex: number,
): DanceScheduleLevelLayout
```

**Algorithm:**

1. `visibleSlots = slots.slice(minLevelIndex, maxLevelIndex + 1)`.
2. Get `{ totalRowUnits, hourMarks, halfHourMarks, rowStartFor, rowSpanFor }` from
   `computeDanceScheduleTimeAxis` (empty-input case returns the empty layout, same
   as today).
3. Build **raw entries**, one per `(session, occupied slot index)` pair — always
   decomposed to single-slot granularity at this stage, mirroring how the room
   algorithm's non-contiguous fallback already works:
   - A session with no ordered level (`session.kind !== 'structured' ||
     session.levels.filter(isOrderedLevel).length === 0`) gets one **floating**
     entry (no slot index) — placed later spanning `columnStart: 0, columnSpan:
     visibleSlots.length`, matching roomless-session treatment today.
   - Otherwise: map `session.levels` to slot indices via `slots.findIndex(slot =>
     slot.levels.includes(level))`, dedupe, filter to `[minLevelIndex,
     maxLevelIndex]` (drop levels outside the currently-selected range — mirrors
     dropping rooms not in `visibleRooms`), sort. One raw entry per surviving index.
     (Never empty for a session that passed `filterDanceSessions`, since that
     filter already guarantees at least one level's slot index is in range.)
4. **Lane assignment**, independently per slot index (excluding floating entries):
   group that slot's entries into overlap-clusters via a sweep (sort by `rowStart`;
   an entry joins the open cluster if its `rowStart` is before the cluster's current
   max row-end, else starts a new cluster), then within each cluster assign lanes
   via greedy interval scheduling (sort by `rowStart`; place each entry in the
   first lane whose last-placed entry's row-end is `<=` this entry's `rowStart`,
   else open a new lane). `laneCount` for every entry in a cluster = that cluster's
   total lane count.
5. **Merge back into spans**: group raw (non-floating) entries by originating
   session. If a session has more than one entry, their slot indices are
   contiguous, AND every one of those entries has `laneCount === 1` (i.e. no
   conflict anywhere in its span) — emit **one** placement spanning
   `columnStart = min(indices), columnSpan = indices.length, lane: 0, laneCount:
   1`. Otherwise, emit **one placement per entry**, each with its own `columnStart
   = index, columnSpan: 1` and its assigned `lane`/`laneCount` (this is the
   documented fallback for the compound rare case, and also the ordinary path for
   a plain single-level session).
6. Floating entries become one placement each: `columnStart: 0, columnSpan:
   Math.max(1, visibleSlots.length), lane: 0, laneCount: 1`.
7. Sort placements by `rowStart`, then `columnStart` (matches today's convention).

### 3. `src/lib/computeDanceScheduleLevelLayout.test.ts` (new)

Mirrors `computeDanceScheduleLayout.test.ts`'s structure/fixtures. Cases: empty
input; hour-mark/day-trim behavior (via shared time-axis — light coverage, most of
this is already covered by the room layout's tests against the same shared code);
single-level placement; contiguous multi-level session (`C1, C2`) spans two
columns when `combineA1A2` is off; `A1, A2` collapses to the merged slot's single
column when `combineA1A2` is on; column set is exactly `slots.slice(min, max+1)`
regardless of what has sessions that day (an empty level column still appears);
a session tagged only `Intro`/`Various`, and a freeform roomless session, both float
across all visible slot columns; **two sessions, same level, overlapping time,
different rooms → both placed with `lane: 0`/`lane: 1`, `laneCount: 2`**; three-way
overlap → 3 lanes; two sessions in the same column at non-overlapping times → both
`lane: 0`, `laneCount: 1` (no unnecessary narrowing); a contiguous multi-level
session that also conflicts with something in one of its columns decomposes into
separate per-column placements (documents the fallback from step 5 above).

### 4. `src/lib/danceScheduleCardSizing.ts` (new — extracted shared constants)

Pulls `UNIT_HEIGHT_PX_WITH_GCA`/`UNIT_HEIGHT_PX_WITHOUT_GCA`,
`CARD_HORIZONTAL_OVERHEAD_PX`, and `DETAILS_MEASUREMENT_FONT` out of
`DanceScheduleGrid.tsx` (currently private there) into a shared module, since the
new grid needs identical values for visual/behavioral consistency (same row
height, same overflow-estimate math). `ROOM_COLUMN_WIDTH_PX` stays local to each
grid component (column content differs — room names in the new view vs. level
codes today — so the two views may end up tuning this independently; start the new
grid at the same 150px default and adjust via live measurement).

`DanceScheduleGrid.tsx` is updated to import these constants instead of defining
them locally — pure refactor, no behavior change (re-run its tests to confirm).

### 5. `src/lib/estimateCardFit.ts` (rename for clarity)

`CardFitInputs.levelsText` → `primaryText` (and the corresponding parameter
plumbing in `DanceScheduleGrid.tsx`'s `SessionCard`) — the function itself already
doesn't care what the "primary/bold" text represents; renaming makes that explicit
now that it's shared by two call sites (level text in the room view, room text in
the level view). Mechanical rename only, no logic change.

### 6. `src/hooks/useDanceScheduleFilters.ts` (modified)

Stops computing `layout` internally. Returns `dateSessions` and `visibleSessions`
instead (both already computed internally today, just not exposed), so each page
computes its own appropriate layout:

```ts
export interface UseDanceScheduleFiltersResult {
  dates: Date[]
  selectedDate: Date
  setSelectedDate: (date: Date) => void
  slots: readonly LevelSlot[]
  minLevelIndex: number
  maxLevelIndex: number
  setLevelRange: (minLevelIndex: number, maxLevelIndex: number) => void
  showGca: boolean
  setShowGca: (showGca: boolean) => void
  dateSessions: DanceSession[]      // was: layout
  visibleSessions: DanceSession[]   // new
}
```

`useDanceScheduleFilters.test.ts` updates its assertions accordingly (was checking
`result.current.layout.placements`/`.visibleRooms`; now checks `visibleSessions`
directly, or leaves room-layout-shape assertions to `DanceSchedulePage`/
`DanceScheduleGrid`-level tests instead).

### 7. `src/components/DanceSchedulePage.tsx` (modified)

Now computes its own layout: `const layout = useMemo(() =>
computeDanceScheduleLayout(dateSessions, visibleSessions), [dateSessions,
visibleSessions])`, using the hook's newly-exposed fields. Everything else
unchanged.

### 8. `src/components/DanceScheduleLevelGrid.tsx` (new)

Mirrors `DanceScheduleGrid.tsx` closely: same two-grid (header/body) sticky-scroll
structure, same GCA-dependent row-height compaction (via the shared sizing
constants), same empty-state message, same overflow-combine heuristic. Differences:

- Columns come from `layout.visibleSlots` (labels only, e.g. `"A1/A2"`, `"C3A"`)
  instead of `layout.visibleRooms`.
- Card's bold primary label is `formatSessionRoom(session)` instead of
  `formatSessionLevels(session)`; roomless sessions (which can't happen for a
  *placed* card in this view except via the floating path) keep the exact same
  `isRoomless` branch as today (time-range-only, italic, centered) — this is
  content-rendering only and is independent of the layout's "floating" placement
  logic, so it needs no new flag, just the same existing check reused verbatim.
- New: when `placement.laneCount > 1`, the card's inline style additionally sets
  `width: calc(100% / laneCount)` and `marginLeft: calc(100% / laneCount *
  lane)` — shrinks and horizontally offsets the card within its already-existing
  single-column CSS Grid track. No nested grids or absolute positioning needed;
  the grid item simply doesn't fill its track's full width when it has lane-mates.
- Color-by-level unchanged (`colorForSession`, per decision 3).

### 9. `src/components/DanceScheduleLevelGrid.test.tsx` (new)

Mirrors `DanceScheduleGrid.test.tsx`'s coverage (room headers → level headers,
card content shows room not level, GCA toggle, combine-on-overflow), plus new
cases for lane rendering: a `laneCount: 2`/`lane: 1` placement gets `width: 50%`
and the expected `marginLeft`; a `laneCount: 1` placement gets neither style
override (full width, as today).

### 10. `src/components/DanceScheduleLevelsPage.tsx` (new)

Mirrors `DanceSchedulePage.tsx`: same `virtual:dance-schedule` +
`virtual:content-config` imports, same `useDanceScheduleFilters` call (shared
state/localStorage key — see design decisions), computes `layout` via the new
`computeDanceScheduleLevelLayout(dateSessions, visibleSessions, slots,
minLevelIndex, maxLevelIndex)`, renders the same `<DanceScheduleFilters>` plus the
new `<DanceScheduleLevelGrid layout={layout} showGca={showGca} />`. Heading text
distinguishes it from the room view (e.g. "Dance Schedule by Level").

### 11. `src/pages/13 dance-schedule-by-level.tsx` (new)

Thin default-export wrapper, per CLAUDE.md's convention (prefix `10` is Schedule,
`12` is the existing Dance Schedule page, so `13` is next available `>= 10`):

```ts
export { DanceScheduleLevelsPage as default } from '../components/DanceScheduleLevelsPage'
```

Auto-appears in the nav as "Dance Schedule By Level" (title-cased from the
kebab-case filename) — no `Nav.tsx`/`buildNavTree.ts` changes needed. Also
automatically becomes a valid restorable page for `useLastPagePersistence` (its
`VALID_HREFS` is derived from the same route list).

### 12. Docs

Add a Decisions entry to `docs/design/dance-schedule.md` covering: the
level-columns view's column-set-is-the-filter-range choice, the overlap
lane-assignment algorithm and its documented simplification for the
multi-level-plus-conflict compound case, the floating treatment for
no-ordered-level sessions, and the shared-localStorage-state choice between the
two pages.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` — full suite including all new/updated
  tests above; confirm `computeDanceScheduleLayout.test.ts` and
  `DanceScheduleGrid.test.tsx` still pass unmodified after their refactors.
- `pnpm build && pnpm preview`, live via `claude-in-chrome`:
  - Navigate to the new page from the nav; confirm level columns match the
    slider's current range and reorder/relabel correctly when `combineA1A2`
    content differs (`pnpm build:test`/`CONTENT_SET=test`).
  - Confirm a multi-level (`C1, C2`) session spans two columns when unmerged.
  - Confirm date/level-range/GCA selection made on one page is still in effect
    after switching to the other page (shared state).
  - Confirm the GCA-hidden row-compaction and level/details-combine-on-overflow
    behaviors still work in the new grid.
- **Overlap rendering has no exercisable case in real or test data today** — add a
  small synthetic fixture to `content/test/data/dance-schedule.xlsx` (two sessions,
  same level, different rooms, overlapping times) specifically to live-verify the
  side-by-side lane rendering via `pnpm dev:test`/`pnpm build:test`, in addition to
  the unit-test coverage in `computeDanceScheduleLevelLayout.test.ts`.
