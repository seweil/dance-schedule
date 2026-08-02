import { assignLanesPerSlot } from './assignLanes'
import { computeDanceScheduleTimeAxis, isContiguous, type TimeMark } from './computeDanceScheduleTimeAxis'
import { isOrderedLevel, type LevelSlot } from './levelOrder'
import type { DanceSession } from '../types/danceSchedule'

// Same 150px starting point as the room-columns grid's own column width — room
// names (this grid's second card line) aren't reliably shorter than level codes
// were, so there's no a priori reason to start narrower. Kept independent of the
// room grid's own constant (not shared) since the two may need to diverge with
// real-world tuning. Lives here (not the component) so the component's combine-
// text-onto-one-line check uses the same formula this file's own lane-width math
// does, not two copies that could drift. This is the 1x (no-overlap) base width —
// see levelColumnWidthPx below for how a
// column's actual rendered width grows past this when it has concurrent lanes
// somewhere in its own time range.
export const LEVEL_COLUMN_WIDTH_PX = 150
export const LEVEL_COLUMN_WIDTH = `${LEVEL_COLUMN_WIDTH_PX}px`

// A column whose peak concurrency (maxLaneCount, across its whole day — a CSS Grid
// column has one width for its entire height, so it's sized for its worst case, not
// per-row) is N lanes gets 50% more width per additional lane past the first: 1x at
// 1 (no overlap), 1.5x at 2, 2x at 3, and so on. Splitting a column into more lanes
// narrows each lane's own share of it (see levelTextWidthPx below), which otherwise
// increases word-wrap/clipping risk — this claws back some (not all — an ever-
// growing column would defeat the point of a fixed-width grid) of that lost width
// by growing the column itself, proportional to how many lanes are actually sharing
// it.
export function levelColumnWidthPx(maxLaneCount: number): number {
  return LEVEL_COLUMN_WIDTH_PX * (1 + 0.5 * (maxLaneCount - 1))
}

// A session with a real room but no ordered level (e.g. a freeform "Country Western
// Dance" entry, or a structured session tagged only Advanced/Intro/Various) gets its
// own dedicated column, appended after every ordered-level column — see
// buildRawEntries and computeDanceScheduleLevelLayout below. It used to float across
// every visible column instead (mirroring roomless-session treatment in the
// room-columns view), but that silently rendered *underneath* whichever single-
// column cards happened to occupy the same row range: CSS Grid allows overlapping
// items with no collision detection, so a full-width card with a normal, opaque
// background is simply painted over by any neighboring single-column card sharing
// its row range, leaving only the portion over a genuinely empty column visible —
// which looked like the session had rendered *inside* that one column instead of
// spanning everything. A genuinely roomless session (no location at all, e.g. a meal
// break) keeps the old floats-across-everything treatment — that one's still
// correct, since it really does mean "nothing else happening in any room."
const OTHER_LEVEL_SLOT: LevelSlot = { label: 'Other', levels: [] }

export interface DanceLevelSessionPlacement {
  session: DanceSession
  rowStart: number
  rowSpan: number
  // 0-based index into `visibleSlots`.
  columnStart: number
  columnSpan: number
  // 0-based sub-column index within this placement's column, for sessions that
  // share a level at overlapping times (different rooms) — see "Overlap lanes"
  // below. 0 and laneCount 1 for the ordinary, non-overlapping case.
  lane: number
  // How many lanes this placement's column is split into for its own row range.
  laneCount: number
}

export interface DanceScheduleLevelLayout {
  visibleSlots: readonly LevelSlot[]
  // One actual pixel width per visible slot, parallel to visibleSlots — see
  // levelColumnWidthPx. Equal to LEVEL_COLUMN_WIDTH_PX for a column with no
  // overlap anywhere in its own day, wider otherwise.
  columnWidthsPx: number[]
  totalRows: number
  // One mark per distinct time some visible session starts/ends at — see
  // computeDanceScheduleTimeAxis.ts's DanceScheduleTimeAxis.timeMarks.
  timeMarks: TimeMark[]
  placements: DanceLevelSessionPlacement[]
}

const EMPTY_LEVEL_LAYOUT: DanceScheduleLevelLayout = {
  visibleSlots: [],
  columnWidthsPx: [],
  totalRows: 0,
  timeMarks: [],
  placements: [],
}

// One entry per (session, occupied slot index) pair — always decomposed to this
// single-slot granularity first, mirroring how the room algorithm's non-contiguous
// multi-room fallback already works; entries get merged back into a wider span in
// mergeIntoPlacements below, only for the common conflict-free case. `slotIndex:
// null` marks a genuinely roomless "floating" entry, handled separately — it never
// participates in overlap-lane assignment. A no-ordered-level entry with a real room
// instead gets OTHER_LEVEL_SLOT's own fixed index (see buildRawEntries) and flows
// through the ordinary per-slot pipeline just like any real level.
interface RawEntry {
  session: DanceSession
  rowStart: number
  rowSpan: number
  slotIndex: number | null
  lane: number
  laneCount: number
}

function buildRawEntries(
  visibleSessions: DanceSession[],
  slots: readonly LevelSlot[],
  minLevelIndex: number,
  maxLevelIndex: number,
  rowStartFor: (time: Date) => number,
  rowSpanFor: (start: Date, end: Date) => number,
): RawEntry[] {
  const entries: RawEntry[] = []

  for (const session of visibleSessions) {
    const rowStart = rowStartFor(session.startTime)
    const rowSpan = rowSpanFor(session.startTime, session.endTime)

    const orderedLevels = session.kind === 'structured' ? session.levels.filter(isOrderedLevel) : []
    if (orderedLevels.length === 0) {
      // OTHER_LEVEL_SLOT is always appended immediately after the ordered-level
      // slice (see computeDanceScheduleLevelLayout below), at this fixed index
      // regardless of the day's actual content — same "columns aren't data-derived"
      // property every other slot already has.
      const slotIndex =
        session.location.kind === 'roomless' ? null : maxLevelIndex - minLevelIndex + 1
      entries.push({ session, rowStart, rowSpan, slotIndex, lane: 0, laneCount: 1 })
      continue
    }

    // Dedupe (a session can repeat a level across kinds/typos in principle) and drop
    // any level whose slot falls outside the currently-selected range — mirrors
    // dropping rooms that aren't in `visibleRooms` in the room-columns algorithm.
    // Never empty here: filterDanceSessions already guarantees at least one of a
    // visible session's levels resolves to an in-range slot index. Converted to an
    // index relative to `minLevelIndex` (i.e. into `visibleSlots`, not the full
    // `slots` array) immediately, so every downstream index (lane grouping,
    // contiguity, placement.columnStart) is already visibleSlots-relative.
    const slotIndices = Array.from(
      new Set(
        orderedLevels
          .map((level) => slots.findIndex((slot) => slot.levels.includes(level)))
          .filter((index) => index !== -1 && index >= minLevelIndex && index <= maxLevelIndex)
          .map((index) => index - minLevelIndex),
      ),
    ).sort((a, b) => a - b)

    for (const slotIndex of slotIndices) {
      entries.push({ session, rowStart, rowSpan, slotIndex, lane: 0, laneCount: 1 })
    }
  }

  return entries
}

// Each column's width is sized for its own PEAK concurrency (the largest laneCount
// any cluster of overlapping entries in that column ever reaches across the whole
// day) — a CSS Grid column has one fixed width for its entire height, so it can't
// vary row-by-row with however many lanes a given moment happens to need. Slots
// with no entries at all (including every slot when entries is empty) default to a
// laneCount of 1 (the plain, ungrown width) — must run after assignLanesPerSlot,
// which is what actually populates each entry's real laneCount.
function computeColumnWidthsPx(entries: RawEntry[], visibleSlotCount: number): number[] {
  const maxLaneCounts = new Array<number>(visibleSlotCount).fill(1)
  for (const entry of entries) {
    if (entry.slotIndex === null) {
      continue
    }
    maxLaneCounts[entry.slotIndex] = Math.max(maxLaneCounts[entry.slotIndex]!, entry.laneCount)
  }
  return maxLaneCounts.map(levelColumnWidthPx)
}

// Merges a session's per-slot entries back into one wide spanning placement when
// its slots are contiguous AND none of them had an overlap conflict (laneCount ===
// 1 everywhere) — reproducing today's room-view multi-room-span behavior for the
// common case. Otherwise (including the rare compound case: a contiguous multi-
// level session that ALSO conflicts with something in one of its columns) each
// entry becomes its own single-column placement with its own lane/laneCount — a
// deliberate simplification rather than full 2D rectangle packing, since that
// compound case has never been observed in real or test data (see
// docs/design/dance-schedule.md).
function mergeIntoPlacements(
  entries: RawEntry[],
  visibleSlotCount: number,
): DanceLevelSessionPlacement[] {
  const placements: DanceLevelSessionPlacement[] = []
  const bySession = new Map<DanceSession, RawEntry[]>()

  for (const entry of entries) {
    if (entry.slotIndex === null) {
      placements.push({
        session: entry.session,
        rowStart: entry.rowStart,
        rowSpan: entry.rowSpan,
        columnStart: 0,
        columnSpan: Math.max(1, visibleSlotCount),
        lane: 0,
        laneCount: 1,
      })
      continue
    }
    const list = bySession.get(entry.session)
    if (list) {
      list.push(entry)
    } else {
      bySession.set(entry.session, [entry])
    }
  }

  for (const sessionEntries of bySession.values()) {
    const indices = sessionEntries.map((entry) => entry.slotIndex!).sort((a, b) => a - b)
    const conflictFree = sessionEntries.every((entry) => entry.laneCount === 1)

    if (sessionEntries.length > 1 && isContiguous(indices) && conflictFree) {
      const first = sessionEntries[0]!
      placements.push({
        session: first.session,
        rowStart: first.rowStart,
        rowSpan: first.rowSpan,
        columnStart: indices[0]!,
        columnSpan: indices.length,
        lane: 0,
        laneCount: 1,
      })
    } else {
      for (const entry of sessionEntries) {
        placements.push({
          session: entry.session,
          rowStart: entry.rowStart,
          rowSpan: entry.rowSpan,
          columnStart: entry.slotIndex!,
          columnSpan: 1,
          lane: entry.lane,
          laneCount: entry.laneCount,
        })
      }
    }
  }

  return placements
}

/**
 * Computes the level-columns counterpart of computeDanceScheduleLayout: columns are
 * level slots (from getLevelSlots, sliced to the currently-selected
 * [minLevelIndex, maxLevelIndex] range) instead of rooms. Unlike rooms, the column
 * set is NOT derived from the data — it's exactly the filter's own range, always
 * shown even for a slot with nothing scheduled that day (see
 * docs/design/dance-schedule.md) — so unlike computeDanceScheduleLayout, this never
 * needs the unfiltered `dateSessions` list at all, only `visibleSessions`.
 *
 * A session with a real room but no ordered level (freeform, or structured with only
 * Advanced/Intro/Various tags) gets its own dedicated "Other" column, appended after
 * every ordered-level column (see OTHER_LEVEL_SLOT). A genuinely roomless session
 * (no location at all) instead floats across every visible column, mirroring
 * roomless-session treatment in the room-columns view. A multi-level session (e.g.
 * "C1, C2") gets one spanning placement when its slots are contiguous and conflict-
 * free, same as a contiguous multi-room session today; otherwise it decomposes into
 * one placement per slot. Two different sessions sharing a level at overlapping
 * times (a room-columns view can never have this — a room is exclusive; a level
 * isn't) are assigned side-by-side lanes within that level's column instead of
 * silently overlapping — see assignLanesPerSlot in assignLanes.ts (shared with
 * computeDanceScheduleCallerLayout.ts).
 */
export function computeDanceScheduleLevelLayout(
  visibleSessions: DanceSession[],
  slots: readonly LevelSlot[],
  minLevelIndex: number,
  maxLevelIndex: number,
): DanceScheduleLevelLayout {
  const timeAxis = computeDanceScheduleTimeAxis(visibleSessions)
  if (!timeAxis) {
    return EMPTY_LEVEL_LAYOUT
  }
  const { rowStartFor, rowSpanFor } = timeAxis

  const visibleSlots = [...slots.slice(minLevelIndex, maxLevelIndex + 1), OTHER_LEVEL_SLOT]

  const rawEntries = buildRawEntries(
    visibleSessions,
    slots,
    minLevelIndex,
    maxLevelIndex,
    rowStartFor,
    rowSpanFor,
  )
  assignLanesPerSlot(rawEntries)
  const columnWidthsPx = computeColumnWidthsPx(rawEntries, visibleSlots.length)
  const placements = mergeIntoPlacements(rawEntries, visibleSlots.length)

  placements.sort((a, b) => a.rowStart - b.rowStart || a.columnStart - b.columnStart)

  return {
    visibleSlots,
    columnWidthsPx,
    totalRows: timeAxis.totalRows,
    timeMarks: timeAxis.timeMarks,
    placements,
  }
}
