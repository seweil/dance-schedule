# Stretch the dance-schedule time axis to fit overflowing card content

## Context

`docs/known-issues.md` (and `DanceScheduleGrid.tsx`'s own code comments) document a
pre-existing bug: session cards are `overflow: hidden` and strictly
time-proportional (`rowSpan = duration / 15min * unitHeightPx`), so a short session
(~30 min) with a long details line (event type + caller names, or a long freeform
description) can visually clip mid-word. A partial mitigation already ships
(`estimateCardFit.ts`'s `shouldCombinePrimaryAndDetails`, which collapses the
primary/details lines onto one when it estimates overflow), but doesn't eliminate
the problem — some real cards still clip after combining.

The known-issue's own "fix direction" note flagged growing a card taller than its
time-proportional span as something that "breaks the 'vertical position exactly
encodes time' property elsewhere in the grid — needs a real design decision, not a
quick tweak." Discussion with the user resolved that decision: **stretch the axis**,
reusing the architecture of the existing "elision" feature (which already compresses
a long roomless break's *excess empty time* out of the axis, with a zigzag marker)
run in reverse — **expand** the axis at an overflow point instead of compressing it.
This was chosen over two alternatives (spill into empty space locally; truncate +
tooltip only) specifically because it reuses a proven, self-consistent mechanism
rather than adding a second, differently-shaped special case. No build-time warning
is wanted — this stays a runtime-only rendering concern, matching the existing
overflow-estimation code (`measureTextWidth.ts`'s live Canvas 2D measurement, which
has no build-time equivalent today).

Accepted, understood tradeoffs (not open questions — already discussed with the
user):
- Expansion happens during a real, occupied time slot, so — unlike elision, which
  only ever touches provably-empty time — every other room/lane's card at that same
  moment also gets extra shared row height, even if its own text fits fine. This is
  harmless visual slack, not data corruption.
- The room-columns view (`DanceScheduleGrid.tsx`) and level-columns view
  (`DanceScheduleLevelGrid.tsx`) compute `textWidthPx` differently (fixed column vs.
  lane-narrowed), so the same session can expand in one view and not the other, or by
  different amounts. Fine — they're separate routes with independently-computed
  layouts already.
- Roomless sessions are out of scope for v1 (their `.roomlessCard` doesn't even have
  `overflow: hidden` today — not the same failure mode `.card` has).

## Design

### Key insight: two independent phases, composed through row-unit space, not raw time

1. **Phase 1 (unchanged):** `computeDanceScheduleTimeAxis()` computes the
   elision-compressed axis exactly as it does today, from `dateSessions`/
   `visibleSessions` alone — no session-content/text knowledge involved.
2. **Phase 2 (unchanged shape):** Each grid's layout function places sessions using
   Phase 1's axis (room derivation / level-slot + lane assignment) exactly as today,
   getting each placement's *natural* `rowStart`/`rowSpan`/`columnSpan`/`laneCount`.
   A monotonic row remap (expansion) never changes which time intervals overlap, so
   this placement pass doesn't need to know about expansion at all.
3. **Phase 3 (new):** Now that each placement's real column width is known, estimate
   its text-fit deficit (via an extended `estimateCardFit`) against its *natural*
   `rowSpan * unitHeightPx`, and turn a positive deficit into a `RowExpansion`
   expressed in Phase 1's own row-unit space (`{ afterRow: rowStart + rowSpan, rows }`).
4. **Phase 4 (new):** A new `expandDanceScheduleTimeAxis()` composes all
   `RowExpansion`s into a second remap layered on Phase 1's, producing final
   `totalRowUnits`/`hourMarks`/`halfHourMarks`/`elisionMarkers`/new
   `expansionMarkers`, plus a `remapRow(row: number): number` used to shift every
   placement's already-computed `rowStart`/`rowSpan` into final values.

This keeps `computeDanceScheduleTimeAxis.ts` a pure row-math module with no
session-content/text knowledge — same as today, just with one more composable remap
layered on top by the layout functions.

### `src/lib/computeDanceScheduleTimeAxis.ts` — add, don't change existing exports

```ts
export interface RowExpansion {
  afterRow: number // a placement's own rowStart + rowSpan, already in this axis's row space
  rows: number
}

export interface DanceScheduleTimeAxisExpansion {
  totalRowUnits: number
  hourMarks: HourMark[]
  halfHourMarks: number[]
  elisionMarkers: number[]
  expansionMarkers: number[]
  remapRow: (row: number) => number
}

export function expandDanceScheduleTimeAxis(
  axis: DanceScheduleTimeAxis,
  expansions: RowExpansion[],
): DanceScheduleTimeAxisExpansion
```

- Group by `afterRow`, taking the **max** `rows` per group (one shared strip; sizing
  to the largest need in the group covers every card in it — mirrors why a
  duplicate/non-contiguous placement emitting the same `{afterRow, rows}` is a
  harmless no-op, not a bug).
- Cumulative walk, mirroring `compress()`'s existing pattern but adding instead of
  subtracting, at a point threshold instead of an interval:
  `remapRow(row) = row + Σ(rows for every expansion where row >= afterRow)`.
  Example: placement `rowStart=5, rowSpan=2` (`afterRow=7`) needing `rows=3`:
  `remapRow(5)=5`, `remapRow(7)=10` → new `rowSpan = 5`, exactly `2 + 3`, nothing
  before the card's own start disturbed.
- `remapRow` is strictly increasing by construction, so — unlike `isElided` — no
  dedup pass is needed on `hourMarks`/`halfHourMarks`: expansion only ever spreads
  distinct rows further apart, never collapses two into one.
- `expansionMarkers = expansions.map((e) => remapRow(e.afterRow))` (post-grouping),
  mirroring `elisionMarkers`'s "row the marker itself renders at" convention.
- Empty `expansions` → identity passthrough (cheap no-op for the common case), same
  posture as `compress()`'s existing empty-elisions fast path.

**Insertion point rationale** (record in a code comment, mirroring the existing
elision comment's style): insert at the overflowing session's **trailing** edge
(`rowStart + rowSpan`), never its start and never the middle. A card's start must
stay glued to its real start time (what every hour-mark-aligned reading of the grid
relies on); inserting at the end means the extra room grows straight down from the
card's real content, the most intuitive reading of "this needed more room and got
it" — and it's the direct expansion analogue of the abandoned first elision attempt
(`docs/design/dance-schedule.md`'s "capped the card's own row span... did nothing
for the actual problem") that motivated doing this at the axis level in the first
place.

### `src/lib/estimateCardFit.ts` — expose needed height, not just a boolean

```ts
export interface CardFitEstimate {
  combine: boolean
  neededHeightPx: number // the estimate for whichever arrangement will actually render
}

export function estimateCardFit(inputs: CardFitInputs, measureWidth: MeasureTextWidth): CardFitEstimate

// Existing signature/behavior preserved exactly as a thin wrapper — no call site changes needed.
export function shouldCombinePrimaryAndDetails(inputs: CardFitInputs, measureWidth: MeasureTextWidth): boolean {
  return estimateCardFit(inputs, measureWidth).combine
}
```

Internals: compute `neededHeightPxUncombined` exactly as today (current function
body); `combine = neededHeightPxUncombined > availableHeightPx` (unchanged trigger).
New: when `combine` is true and `primaryText` is non-empty, also estimate the
*combined* arrangement's real line count
(`estimateWrappedLineCount(`${primaryText} ${detailsText}`, textWidthPx, measureWidth)`)
and return that as `neededHeightPx` instead of the uncombined sum — this is the
number a deficit calculation needs, since combining is already credited before
reporting overflow. Every existing `estimateCardFit.test.ts` case (and both grid
components' existing combine-decision call sites) is unaffected — `combine`'s value
and computation are untouched.

### `src/lib/estimateCardExpansion.ts` (new file)

```ts
export const MAX_EXPANSION_ROWS_PER_SESSION = 4 // defensive cap, not a tuned "just enough" value

export function estimateCardRowExpansion(
  inputs: CardFitInputs,
  rowStart: number,
  rowSpan: number,
  unitHeightPx: number,
): RowExpansion | null
```

Calls `estimateCardFit`, computes `deficitPx = neededHeightPx - inputs.availableHeightPx`;
returns `null` when `deficitPx <= 0`; otherwise
`{ afterRow: rowStart + rowSpan, rows: Math.min(MAX_EXPANSION_ROWS_PER_SESSION, Math.ceil(deficitPx / unitHeightPx)) }`.
The cap exists so one pathologically long details string can't stretch the whole
page's scroll length unboundedly — a session that hits it still clips its residual
overflow exactly as before this feature, a strict improvement (less clipping), not a
guarantee of zero clipping in every case (same posture as elision, which only
handles its one known case).

### `src/lib/computeDanceScheduleLayout.ts`

- Move `ROOM_COLUMN_WIDTH_PX`/`ROOM_COLUMN_WIDTH` here from `DanceScheduleGrid.tsx`
  (export both), and add exported `roomTextWidthPx(columnSpan: number): number`
  wrapping the existing `columnSpan * ROOM_COLUMN_WIDTH_PX - CARD_HORIZONTAL_OVERHEAD_PX`
  formula — needed so the deficit pass and the component's render-time recheck use
  one shared formula, not two copies that could drift.
- Signature becomes `computeDanceScheduleLayout(dateSessions, visibleSessions, showGca: boolean)`.
  `DanceScheduleLayout` gains `expansionMarkers: number[]`; `EMPTY_LAYOUT` gains
  `expansionMarkers: []`.
- After building `placements` against Phase-1's `timeAxis` exactly as today: for
  every **non-roomless** placement, build `CardFitInputs` (`formatSessionLevels`,
  `detailsPlainText`, `formatSessionGca`, `showGca && !!gca`,
  `placement.rowSpan * unitHeightPx`, `roomTextWidthPx(placement.columnSpan)`), call
  `estimateCardRowExpansion`, collect non-null results (don't gate this on
  `!!levels` — a details-only card can still overflow on its own; `estimateCardFit`
  already handles an empty `primaryText` correctly).
- Call `expandDanceScheduleTimeAxis(timeAxis, rowExpansions)`; remap every
  placement's `rowStart`/`rowSpan` via `expanded.remapRow`; return
  `totalRowUnits`/`hourMarks`/`halfHourMarks`/`elisionMarkers`/`expansionMarkers`
  from the expanded result.

### `src/lib/computeDanceScheduleLevelLayout.ts` — same shape

- Move `LEVEL_COLUMN_WIDTH_PX`/`LEVEL_COLUMN_WIDTH` here from
  `DanceScheduleLevelGrid.tsx`; add exported `levelTextWidthPx(columnSpan, laneCount)`
  wrapping the existing lane-aware formula.
- Signature becomes `computeDanceScheduleLevelLayout(dateSessions, visibleSessions, slots, minLevelIndex, maxLevelIndex, showGca: boolean)`.
  `DanceScheduleLevelLayout` gains `expansionMarkers: number[]`.
- Deficit pass mirrors the room grid's, deriving `primaryText = formatSessionRoom(session)`
  and the level-prefix the same way `DanceScheduleLevelGrid.tsx`'s `SessionCard`
  does today.

### Why the combine decision itself doesn't move into the lib layer

Considered and rejected: storing `combine`/`neededHeightPx` on the placement object
(to avoid a second `estimateCardFit` call at render time) would require adding a
field to `DanceSessionPlacement`/`DanceLevelSessionPlacement` and rewriting every
test that hand-constructs placements bypassing the lib. Not worth it —
`estimateCardFit` is pure/deterministic, so the lib's pass (using the *natural*
pre-expansion height) and the component's render-time recheck (using the *final*
post-expansion height, which is always >= natural) always agree on `combine`, and
can only diverge in which arrangement they'd pick when both already fit — never in
whether something clips. Leave both call sites exactly as they are structurally;
only their shared formula moves into the lib (`roomTextWidthPx`/`levelTextWidthPx`).

### `src/components/DanceScheduleGrid.tsx`

- Remove the local `ROOM_COLUMN_WIDTH_PX`/`ROOM_COLUMN_WIDTH` consts; import them
  (plus `roomTextWidthPx`) from `../lib/computeDanceScheduleLayout`; use
  `roomTextWidthPx(columnSpan)` in `SessionCard`'s existing
  `shouldCombinePrimaryAndDetails` call in place of the inline formula. No other
  change to that call — `placement.rowSpan` is now the *final* post-expansion span,
  which is self-consistent per the point above.
- Render a new `expansionMarkers` block (copy the existing `elisionMarkers` block's
  structure/props, new `styles.expansionMarker` class).

### `src/components/DanceScheduleLevelGrid.tsx`

Same two changes: import `LEVEL_COLUMN_WIDTH_PX`/`levelTextWidthPx` from the lib
instead of local consts/inline formula; add the `expansionMarkers` render block.

### `src/components/DanceScheduleGrid.module.css`

Add `.expansionMarker`, copying `.elisionMarker`'s current rule (lines 206-213: 8px
height, `margin-top: -4px`, non-sticky, same `background-size`/`repeat-x` zigzag
technique, positioned via inline `gridColumn`/`gridRow` style at the call site, not
in this CSS block) but with the SVG polyline's y-coordinates inverted (elision's
notch points down/inward — `0,6 4,1 8,6 12,1 16,6`; expansion's should point
up/outward — `0,1 4,6 8,1 12,6 16,1`) and a distinct `color` (e.g. a faint cool tint
vs. elision's neutral `#eee`), so the two remain visually quiet but distinguishable —
both communicate "vertical distance here ≠ real time," but mean opposite things.

### `src/components/DanceSchedulePage.tsx` / `src/components/DanceScheduleLevelsPage.tsx`

Thread `showGca` into the layout `useMemo` call and its dependency array:

```tsx
const layout = useMemo(
  () => computeDanceScheduleLayout(dateSessions, visibleSessions, showGca),
  [dateSessions, visibleSessions, showGca],
)
```

(today: `computeDanceScheduleLayout(dateSessions, visibleSessions)`, deps
`[dateSessions, visibleSessions]` — confirmed at
`DanceSchedulePage.tsx:29-32`/`DanceScheduleLevelsPage.tsx:36-39`.) This is a real,
deliberate behavior change: toggling "Show GCA" today is a pure render-time rescale;
after this feature it also re-runs the deficit/expansion pass (since `hasGcaLine`
and `unitHeightPx` both feed the deficit). Acceptable — an infrequent checkbox
click, not a per-frame cost, and `measureTextWidth`'s canvas context is already
cached module-wide.

## Testing

- **`computeDanceScheduleTimeAxis.test.ts`** — new `describe('expandDanceScheduleTimeAxis', ...)`:
  no-expansions identity; single expansion shifts only rows at/after it; two
  expansions at different `afterRow`s compose cumulatively; two at the *same*
  `afterRow` take the max, not the sum; an expansion composing correctly with an
  existing elision; hour/half-hour marks at an expansion boundary are kept, not
  dropped (contrast with elision's dedup behavior).
- **`estimateCardFit.test.ts`** — extend for `estimateCardFit()`'s `neededHeightPx`:
  comfortable card (uncombined formula); overflow-but-combined-fits (smaller
  combined-line-count estimate, not the uncombined sum); still-overflows-combined.
  Existing `shouldCombinePrimaryAndDetails` tests need no changes.
- **`estimateCardExpansion.test.ts`** (new) — comfortable → `null`; needs 1-2 rows →
  correct `{afterRow, rows}`; pathological deficit → capped at
  `MAX_EXPANSION_ROWS_PER_SESSION`; with-GCA vs. without-GCA `unitHeightPx` changes
  the outcome.
- **`computeDanceScheduleLayout.test.ts`** / **`computeDanceScheduleLevelLayout.test.ts`** —
  every existing call needs a `showGca` arg added (mechanical). New cases: a short
  session with long details produces a placement whose final `rowSpan` exceeds its
  natural span, with a matching `expansionMarkers` entry; a comfortable session is
  unaffected; a concurrent non-overflowing placement in a different room/lane still
  gets `rowSpan` inflated by a neighbor's expansion (confirms the shared-slack
  tradeoff is real, not accidentally scoped away); toggling `showGca` changes
  expansion outcome. Level-view: a lane-split (`laneCount > 1`) card expands at a
  narrower width where a full-width lane wouldn't have.
- **`DanceScheduleGrid.test.tsx`** / **`DanceScheduleLevelGrid.test.tsx`** —
  `makeLayout()`'s fixture (currently at `DanceScheduleGrid.test.tsx:33-46`, already
  includes `elisionMarkers: []`) needs `expansionMarkers: []` added. New test
  rendering a non-empty `expansionMarkers` entry, asserting a `.expansionMarker`
  element appears at the right `gridRow`/`gridColumn: 1` (mirror whatever existing
  elision-marker rendering test exists). Existing combine-behavior tests need no
  changes (they hand-construct placements and rely on the component's own
  unmodified render-time `shouldCombinePrimaryAndDetails` call).

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` must pass, including all new/updated
  test cases above.
- Manually verify against real data: `pnpm dev` (or `pnpm build && pnpm preview`)
  with a content set that reproduces the known overflow cases already documented
  live (`docs/known-issues.md` names specific real cards, e.g. "GCA Caller Showcase
  Dance - Michael Maltenfort", "Ballroom West Skirt Work Hour - Wendy VanderMeulen"
  in a 2-lane column) — confirm those cards no longer clip, an `.expansionMarker`
  renders at the right spot, and every other room/lane's card at that same time
  still renders correctly (just with extra shared slack, not corruption). Check both
  `/dance-schedule` (room-columns) and `/dance-by-level` (level-columns) views, and
  toggle "Show GCA" to confirm relayout behaves correctly in both states.
- Confirm an ordinary day with no overflow is byte-for-byte visually unaffected
  (identity-passthrough fast path).

## Critical files

- `src/lib/computeDanceScheduleTimeAxis.ts` — add `RowExpansion`/`expandDanceScheduleTimeAxis`
- `src/lib/estimateCardFit.ts` — add `estimateCardFit`/`CardFitEstimate`, keep `shouldCombinePrimaryAndDetails` as a wrapper
- `src/lib/estimateCardExpansion.ts` — new file
- `src/lib/computeDanceScheduleLayout.ts` — thread `showGca`, own `ROOM_COLUMN_WIDTH_PX`/`roomTextWidthPx`, run the deficit/expansion pass
- `src/lib/computeDanceScheduleLevelLayout.ts` — same, with `LEVEL_COLUMN_WIDTH_PX`/`levelTextWidthPx`
- `src/components/DanceScheduleGrid.tsx` / `DanceScheduleLevelGrid.tsx` — import moved constants, render `expansionMarkers`
- `src/components/DanceScheduleGrid.module.css` — add `.expansionMarker`
- `src/components/DanceSchedulePage.tsx` / `DanceScheduleLevelsPage.tsx` — thread `showGca` into the layout `useMemo`
