import {
  computeDanceScheduleTimeAxis,
  expandDanceScheduleTimeAxis,
  isContiguous,
  type HourMark,
  type RowExpansion,
} from './computeDanceScheduleTimeAxis'
import { detailsPlainText } from './danceScheduleCardContent'
import {
  CARD_HORIZONTAL_OVERHEAD_PX,
  CARD_PADDING_PX,
  DETAILS_MEASUREMENT_FONT,
  UNIT_HEIGHT_PX_WITH_GCA,
  UNIT_HEIGHT_PX_WITHOUT_GCA,
} from './danceScheduleCardSizing'
import { estimateCardRowExpansion } from './estimateCardExpansion'
import { formatSessionGca, formatSessionLevels, formatSessionRoom } from './formatDanceSession'
import { isOrderedLevel, type LevelSlot } from './levelOrder'
import { measureTextWidth } from './measureTextWidth'
import type { DanceSession } from '../types/danceSchedule'

// Same 150px starting point as the room-columns grid's own column width — room
// names (this grid's second card line) aren't reliably shorter than level codes
// were, so there's no a priori reason to start narrower. Kept independent of the
// room grid's own constant (not shared) since the two may need to diverge with
// real-world tuning. Lives here (not the component) so this lib's own text-fit/
// expansion pass and the component's render-time recheck share one formula.
export const LEVEL_COLUMN_WIDTH_PX = 150
export const LEVEL_COLUMN_WIDTH = `${LEVEL_COLUMN_WIDTH_PX}px`

// A lane-split card's own box width is track/laneCount exactly (an explicit
// percentage width, not grid-stretch-filled), so its usable text width is that
// minus just the padding, not the combined margin+padding overhead: margin sits
// outside a border-box element and doesn't shrink its content area the way padding
// does. Only the ordinary (laneCount === 1, grid-stretch-filled) case uses
// CARD_HORIZONTAL_OVERHEAD_PX, same as the room-columns grid.
export function levelTextWidthPx(columnSpan: number, laneCount: number): number {
  return laneCount > 1
    ? (columnSpan * LEVEL_COLUMN_WIDTH_PX) / laneCount - CARD_PADDING_PX
    : columnSpan * LEVEL_COLUMN_WIDTH_PX - CARD_HORIZONTAL_OVERHEAD_PX
}

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
  totalRowUnits: number
  hourMarks: HourMark[]
  halfHourMarks: number[]
  // Row-start positions where a "scale break" marker renders in the sticky time
  // column — see computeDanceScheduleTimeAxis.ts's elisionMarkers.
  elisionMarkers: number[]
  // Row-start positions where the axis was stretched to fit overflowing card
  // content — the expansion counterpart to elisionMarkers, see
  // expandDanceScheduleTimeAxis. Not currently rendered as a visual marker (unlike
  // elisionMarkers) — kept on the layout since it's still meaningful diagnostic
  // data about where/how much the axis was stretched.
  expansionMarkers: number[]
  placements: DanceLevelSessionPlacement[]
}

const EMPTY_LEVEL_LAYOUT: DanceScheduleLevelLayout = {
  visibleSlots: [],
  totalRowUnits: 0,
  hourMarks: [],
  halfHourMarks: [],
  elisionMarkers: [],
  expansionMarkers: [],
  placements: [],
}

const measureWidth = (text: string) => measureTextWidth(text, DETAILS_MEASUREMENT_FONT)

// The level-view counterpart of computeDanceScheduleLayout.ts's collectRowExpansions
// — same idea (a placement's card estimated to need more vertical space than its
// real, time-proportional rowSpan provides), but derives primaryText/detailsText/
// textWidthPx the level grid's own way (room as the primary line, lane-aware column
// width) — mirrors DanceScheduleLevelGrid.tsx's SessionCard exactly. Roomless cards
// are out of scope for the same reason as the room-columns view.
function collectRowExpansions(
  placements: DanceLevelSessionPlacement[],
  slots: readonly LevelSlot[],
  showGca: boolean,
  unitHeightPx: number,
): RowExpansion[] {
  const expansions: RowExpansion[] = []
  for (const placement of placements) {
    const { session, rowStart, rowSpan, columnStart, columnSpan, laneCount } = placement
    if (session.location.kind === 'roomless') {
      continue
    }
    const room = formatSessionRoom(session)
    const gca = formatSessionGca(session)
    const slot = slots[columnStart]
    const levelPrefix = slot && slot.levels.length > 1 ? formatSessionLevels(session) : undefined
    const expansion = estimateCardRowExpansion(
      {
        primaryText: room,
        detailsText: detailsPlainText(session, levelPrefix),
        hasGcaLine: showGca && !!gca,
        availableHeightPx: rowSpan * unitHeightPx,
        textWidthPx: levelTextWidthPx(columnSpan, laneCount),
      },
      rowStart,
      rowSpan,
      unitHeightPx,
      measureWidth,
    )
    if (expansion) {
      expansions.push(expansion)
    }
  }
  return expansions
}

// One entry per (session, occupied slot index) pair — always decomposed to this
// single-slot granularity first, mirroring how the room algorithm's non-contiguous
// multi-room fallback already works; entries get merged back into a wider span in
// mergeIntoPlacements below, only for the common conflict-free case. `slotIndex:
// null` marks a "floating" entry (a session with no ordered level at all), handled
// separately — it never participates in overlap-lane assignment.
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
      entries.push({ session, rowStart, rowSpan, slotIndex: null, lane: 0, laneCount: 1 })
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

// Greedy interval-scheduling lane assignment within one already-clustered group of
// mutually (transitively) time-overlapping entries in the same column — the same
// algorithm calendar day-views use for concurrent events. Mutates each entry's
// lane/laneCount in place.
function assignLanes(cluster: RawEntry[]): void {
  const laneEnds: number[] = [] // exclusive row-end of the last entry placed in each lane
  for (const entry of cluster) {
    const rowEnd = entry.rowStart + entry.rowSpan
    let lane = laneEnds.findIndex((end) => end <= entry.rowStart)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(rowEnd)
    } else {
      laneEnds[lane] = rowEnd
    }
    entry.lane = lane
  }
  const laneCount = laneEnds.length
  for (const entry of cluster) {
    entry.laneCount = laneCount
  }
}

// Assigns lanes independently per slot index — a placement's overlap partners are
// only ever the other sessions claiming the *same* level, never a different one.
function assignLanesPerSlot(entries: RawEntry[]): void {
  const bySlot = new Map<number, RawEntry[]>()
  for (const entry of entries) {
    if (entry.slotIndex === null) {
      continue
    }
    const list = bySlot.get(entry.slotIndex)
    if (list) {
      list.push(entry)
    } else {
      bySlot.set(entry.slotIndex, [entry])
    }
  }

  for (const slotEntries of bySlot.values()) {
    slotEntries.sort((a, b) => a.rowStart - b.rowStart)

    let clusterStart = 0
    while (clusterStart < slotEntries.length) {
      let clusterEnd = clusterStart + 1
      let maxRowEnd = slotEntries[clusterStart]!.rowStart + slotEntries[clusterStart]!.rowSpan
      while (clusterEnd < slotEntries.length && slotEntries[clusterEnd]!.rowStart < maxRowEnd) {
        maxRowEnd = Math.max(
          maxRowEnd,
          slotEntries[clusterEnd]!.rowStart + slotEntries[clusterEnd]!.rowSpan,
        )
        clusterEnd++
      }
      assignLanes(slotEntries.slice(clusterStart, clusterEnd))
      clusterStart = clusterEnd
    }
  }
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
 * docs/design/dance-schedule.md).
 *
 * A session with no ordered level (freeform, or structured with only
 * Advanced/Intro/Various tags) floats across every visible slot column, mirroring
 * roomless-session treatment in the room-columns view. A multi-level session (e.g.
 * "C1, C2") gets one spanning placement when its slots are contiguous and conflict-
 * free, same as a contiguous multi-room session today; otherwise it decomposes into
 * one placement per slot. Two different sessions sharing a level at overlapping
 * times (a room-columns view can never have this — a room is exclusive; a level
 * isn't) are assigned side-by-side lanes within that level's column instead of
 * silently overlapping — see assignLanesPerSlot above.
 */
export function computeDanceScheduleLevelLayout(
  dateSessions: DanceSession[],
  visibleSessions: DanceSession[],
  slots: readonly LevelSlot[],
  minLevelIndex: number,
  maxLevelIndex: number,
  showGca: boolean,
): DanceScheduleLevelLayout {
  const timeAxis = computeDanceScheduleTimeAxis(dateSessions, visibleSessions)
  if (!timeAxis) {
    return EMPTY_LEVEL_LAYOUT
  }
  const { rowStartFor, rowSpanFor } = timeAxis
  const unitHeightPx = showGca ? UNIT_HEIGHT_PX_WITH_GCA : UNIT_HEIGHT_PX_WITHOUT_GCA

  const visibleSlots = slots.slice(minLevelIndex, maxLevelIndex + 1)

  const rawEntries = buildRawEntries(
    visibleSessions,
    slots,
    minLevelIndex,
    maxLevelIndex,
    rowStartFor,
    rowSpanFor,
  )
  assignLanesPerSlot(rawEntries)
  const placements = mergeIntoPlacements(rawEntries, visibleSlots.length)

  placements.sort((a, b) => a.rowStart - b.rowStart || a.columnStart - b.columnStart)

  const expansions = collectRowExpansions(placements, visibleSlots, showGca, unitHeightPx)
  const expanded = expandDanceScheduleTimeAxis(timeAxis, expansions)
  const expandedPlacements = placements.map((placement) => ({
    ...placement,
    rowStart: expanded.remapRow(placement.rowStart),
    rowSpan:
      expanded.remapRow(placement.rowStart + placement.rowSpan) -
      expanded.remapRow(placement.rowStart),
  }))

  return {
    visibleSlots,
    totalRowUnits: expanded.totalRowUnits,
    hourMarks: expanded.hourMarks,
    halfHourMarks: expanded.halfHourMarks,
    elisionMarkers: expanded.elisionMarkers,
    expansionMarkers: expanded.expansionMarkers,
    placements: expandedPlacements,
  }
}
