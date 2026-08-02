# Add a "Dance by Caller" view (one column per headline caller)

**Post-implementation addendum:** two more rules were added mid-build, per
direct user direction: "GCA Caller Showcase Dance" sessions are omitted
entirely (not just hidden from the GCA line — excluded before column
derivation and dance-counting both), and a caller only gets a column once
they have more than 3 real (non-showcase) dances that day. Implemented in
`computeDanceScheduleCallerLayout.ts` via `GCA_CALLER_SHOWCASE_EVENT_TYPE`
and `MIN_CALLER_DANCES`; documented in `docs/design/dance-schedule.md`. Not
reflected in every line of the narrative design section below (written
before these were added), but fully implemented and tested.

## Context

The dance schedule already has two views of the same underlying session
data: room-columns (`/dance-schedule`) and level-columns (`/dance-by-level`),
both sharing one filter hook and one CSS module, differing only in what
becomes the grid's columns. The user wants a third view — one column per
**headline caller** — so someone can scan "what is caller X doing all day"
directly, the same way the level view answers "what's running at level X all
day." Headline caller means `session.callers` specifically, excluding the
separate `gca` field. A "trail-in" concept was raised but confirmed **out of
scope**: it doesn't exist anywhere in the dance-schedule data model or
spreadsheet convention today (verified by exhaustive grep — zero hits in
code, docs, or any real/fixture data), it only exists informally in the
unrelated Event Schedule's free text, and the user confirmed it may be added
later but not now. Excluding GCA needs no new code — `gca` is already a
field the column-derivation step simply never reads.

Filters are identical to the other two pages — date, level-range slider,
**and** the GCA checkbox (the user initially asked to drop the checkbox,
then reversed that decision) — so `DanceScheduleFilters` is reused completely
unchanged.

## Design

### Column derivation — data-derived, like rooms; NOT filter-derived, like levels

Callers are free text with no fixed vocabulary and no per-date guarantee of
who's teaching, so columns are discovered the same way `deriveRoomOrder`
discovers rooms: walk `dateSessions` (unfiltered by level, so the column set
stays stable as the level range narrows) in chronological order, and for
each `kind === 'structured'` session append each name in `callers` to an
ordered, deduped list on first appearance. Filter that list down to callers
actually present in `visibleSessions` (mirrors `visibleRoomSet`).

### No "Other" column, no floating — sessions with no caller are skipped entirely

Revised per direct user feedback mid-implementation: unlike the level view's
`OTHER_LEVEL_SLOT` (and unlike either view's roomless-floats-across-everything
treatment), this view **skips any session with no caller outright** — a
lunch break or any other freeform session (no `callers` field at all) simply
never appears here, not floated, not in a dedicated column. Only
`kind === 'structured'` sessions (guaranteed `callers.length >= 1`) ever
produce a placement.

Practically: both `computeDanceScheduleTimeAxis` and caller-order derivation
run only over the `kind === 'structured'` subset of `dateSessions`/
`visibleSessions` — a freeform session contributes no column, no time-axis
tick, nothing. This also means a lunch break's time range no longer creates
rows in this view at all, which is the intended effect ("skip lunch and
other events with no caller").

Placement generation, now simpler than either other view: for each
`kind === 'structured'` session, one entry per (deduped, via `Set`) name in
`callers`, at that name's column index, always `columnSpan: 1`. **No
contiguous-span merge** — unlike a multi-room or multi-level session, two
callers' columns have no meaningful adjacency (order is arbitrary
first-appearance), so a co-taught session just gets the identical card
independently placed in each of its callers' columns. This is a deliberate
simplification relative to both other views, worth calling out explicitly in
the docs.

Lane assignment is kept as a defensive safety net only (extracted into the
shared `assignLanes.ts` regardless — see below) — a genuine data-entry error
(the same caller listed for two overlapping sessions) is the only way two
entries could ever land in the same column, since every other route into a
column requires a distinct caller name.

### Lane assignment — extract, don't duplicate

A single real caller can't double-book themselves except via a genuine
data-entry error, so lane assignment here is a defensive safety net rather
than something realistically exercised — but it's the same greedy
interval-scheduling algorithm already implemented (and private) in
`computeDanceScheduleLevelLayout.ts`, and reusing it costs nothing. Since
this is now a second consumer of that ~30-line algorithm, extract it into a
new shared file rather than duplicate it — mirroring this codebase's own
precedent for `computeDanceScheduleTimeAxis.ts` (extracted at exactly its
second consumer, deliberately kept ignorant of domain-specific fields).
(Already done: `src/lib/assignLanes.ts` now exists and
`computeDanceScheduleLevelLayout.ts` has been refactored to import from it,
with no behavior change.)

### Column width

Same growth formula as the level view (`WIDTH_PX * (1 + 0.5*(maxLaneCount-1))`),
as its own independent constant (`CALLER_COLUMN_WIDTH_PX = 150`) — matching
the level view's own comment on why its constant isn't shared with the room
view's. In practice almost every real caller column will compute
`maxLaneCount = 1`; only "Other" is likely to ever grow.

### Card content

Caller is implied by the column, so it's never shown on the card. Unlike the
level view (where level is the column and caller is still worth bolding),
here neither room nor level is implied — both are genuinely new information.
Layout: `.levels` line first (`formatSessionLevels`, plain, same as the room
view), then a `.details` line with event-type-prefix + **bold room**
(a new small sibling of `detailsContent`, bolding `formatSessionRoom`
instead of `formatSessionCallers`), then the existing optional GCA line,
unchanged. Freeform sessions (the "Other" column) fall back to their plain
description, same pattern `detailsContent` already uses.

## Files

**New:**
- `src/lib/assignLanes.ts` — `assignLanes`/`assignLanesPerSlot`, moved out of
  `computeDanceScheduleLevelLayout.ts` verbatim, generalized to a
  `LaneEntry` interface (`rowStart`, `rowSpan`, `slotIndex: number | null`,
  `lane`, `laneCount`) instead of the level file's `RawEntry`. Pure move, no
  behavior change.
- `src/lib/computeDanceScheduleCallerLayout.ts` — the new layout function,
  structured as a sibling of `computeDanceScheduleLevelLayout.ts` but
  simpler: only `kind === 'structured'` sessions ever participate (freeform/
  callerless sessions, e.g. lunch breaks, are filtered out up front, per
  user direction — no "Other" column, no floating). Caller-order derivation
  mirrors `deriveRoomOrder`, one placement per (deduped via `Set`) name in
  `callers` at that name's column index — no `isContiguous`/conflict-free
  merge branch needed at all, since `columnSpan` is always 1.
  `assignLanesPerSlot` (from the new shared file) stays as a defensive
  safety net for a hypothetical data-entry error. Exports
  `CALLER_COLUMN_WIDTH_PX`, `CALLER_COLUMN_WIDTH`, `callerColumnWidthPx`,
  `DanceCallerSessionPlacement`, `DanceScheduleCallerLayout`, and
  `computeDanceScheduleCallerLayout(dateSessions, visibleSessions, ...)` —
  needs both, like the room layout (data-derived columns), unlike the level
  layout (filter-derived).
- `src/components/DanceScheduleCallerGrid.tsx` — copy of
  `DanceScheduleLevelGrid.tsx`'s two-grid sticky-scroll shell verbatim
  (same `DanceScheduleGrid.module.css` import, same header/body
  ref/scroll-sync/reset-on-layout-change plumbing), with `SessionCard`
  simplified (no `slots`/`levelPrefix` concept — a caller column is never
  ambiguous the way a combined level slot can be) and using the new
  `detailsWithRoomContent` helper instead of `detailsContent`. Column
  headers render `visibleCallers[index]` strings directly (plain strings,
  not `LevelSlot` objects).
- `src/components/DanceScheduleCallersPage.tsx` — same shape as
  `DanceScheduleLevelsPage.tsx`: `useDanceScheduleFilters` unchanged (also
  destructuring `dateSessions`, like `DanceSchedulePage.tsx` does), memoized
  `computeDanceScheduleCallerLayout(dateSessions, visibleSessions, ...)`,
  `<PageHeader title="Dance by Caller" />`, `<DanceScheduleFilters>` with
  every prop unchanged (including the GCA checkbox), and the new grid.
- `src/pages/14 dance-by-caller.tsx` — thin wrapper:
  `export { DanceScheduleCallersPage as default } from '../components/DanceScheduleCallersPage'`.
  Prefix `14` — `12`/`13` are already taken by the other two dance-schedule
  pages.
- `src/lib/computeDanceScheduleCallerLayout.test.ts` and
  `src/components/DanceScheduleCallerGrid.test.tsx` — colocated, mirroring
  the level view's own test files' fixture-building style. Cover: single-
  caller placement, co-caller fan-out to 2+ columns, a freeform/callerless
  session (e.g. a lunch break) being entirely skipped (no column, no time-
  axis row), and overlapping-time lane splitting for the defensive
  same-caller case.

**Modified:**
- `src/lib/computeDanceScheduleLevelLayout.ts` — remove the private
  `assignLanes`/`assignLanesPerSlot`, import `assignLanesPerSlot` from the
  new shared file instead. `RawEntry` stays declared locally (it carries an
  extra `session` field the shared `LaneEntry` doesn't need) but must
  structurally satisfy `LaneEntry`. Pure refactor — existing tests should
  pass unchanged.
- `src/lib/danceScheduleCardContent.tsx` — add `detailsWithRoomContent(session)`,
  a sibling of `detailsContent` bolding `formatSessionRoom` instead of
  `formatSessionCallers`, same freeform-fallback and event-type-prefix
  behavior. (No plain-text sibling needed — `detailsPlainText` itself has no
  current consumer anywhere in `src/`, so there's no existing pairing
  convention to mirror.)
- `docs/design/dance-schedule.md` — new "Caller-columns view" section
  modeled on "Level-columns view"'s structure/depth: why, reuse of the same
  filters/hook, skipping callerless sessions entirely instead of an "Other"
  column or floating (explicit contrast with both other views' treatment of
  a session with nothing to place it by), no contiguous-span-merge
  (explicit contrast with both other views and why caller-column adjacency
  is meaningless), and the `assignLanes.ts` extraction as a second-consumer
  threshold (mirroring the doc's own framing of the time-axis extraction).

## Verification

- `pnpm test` — new unit tests pass, existing
  `computeDanceScheduleLevelLayout.test.ts` still passes unchanged after the
  `assignLanes.ts` extraction (confirms the refactor is behavior-preserving).
- `pnpm typecheck && pnpm lint`.
- `pnpm dev` (or `pnpm dev:test`), navigate to `/dance-by-caller`:
  - Confirm one column per caller, in first-appearance order.
  - Pick a date/content set with a real co-caller session (e.g.
    `MotivateToSeattle`'s "Michael Kellogg & Terri Sherrer") and confirm the
    identical card appears in both callers' columns.
  - Confirm a lunch/dinner break (and any other freeform/callerless session)
    doesn't appear anywhere in this view at all — no column, no row, no
    stray gap in the time axis for it.
  - Toggle the GCA checkbox and confirm the GCA line still shows/hides
    correctly on this page.
  - Change the level-range slider and confirm the caller column set doesn't
    reshuffle, only which sessions/cards are visible within it (matching the
    room view's own stable-column behavior).
  - Spot-check mobile viewport (sticky header, horizontal scroll) since the
    grid shell is copied verbatim from the level view.
- No new e2e coverage planned, matching the level view's own precedent (zero
  `dance-by-level` references in `e2e/`) — unit + component tests are the
  established bar for this feature area.
