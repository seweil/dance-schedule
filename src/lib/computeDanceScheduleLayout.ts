import {
  computeDanceScheduleTimeAxis,
  expandDanceScheduleTimeAxis,
  isContiguous,
  type HourMark,
  type RowExpansion,
} from './computeDanceScheduleTimeAxis'
import {
  CARD_HORIZONTAL_OVERHEAD_PX,
  DETAILS_MEASUREMENT_FONT,
  UNIT_HEIGHT_PX_WITH_GCA,
  UNIT_HEIGHT_PX_WITHOUT_GCA,
} from './danceScheduleCardSizing'
import { detailsPlainText } from './danceScheduleCardContent'
import { estimateCardRowExpansion } from './estimateCardExpansion'
import { formatSessionGca, formatSessionLevels } from './formatDanceSession'
import { measureTextWidth } from './measureTextWidth'
import type { DanceSession } from '../types/danceSchedule'

// Fixed, not minmax(150px, 1fr) — see the .grid comment in DanceScheduleGrid.module.css
// for why a flexible track can't be trusted to resolve identically across that
// component's two separate grid containers (header vs. body). Lives here (not the
// component) so this lib's own text-fit/expansion pass and the component's
// render-time recheck share one formula, not two copies that could drift.
export const ROOM_COLUMN_WIDTH_PX = 150
export const ROOM_COLUMN_WIDTH = `${ROOM_COLUMN_WIDTH_PX}px`

export function roomTextWidthPx(columnSpan: number): number {
  return columnSpan * ROOM_COLUMN_WIDTH_PX - CARD_HORIZONTAL_OVERHEAD_PX
}

export interface DanceSessionPlacement {
  session: DanceSession
  // 1-based index of the first 15-minute unit this placement occupies, counting from
  // the grid's dayStart (row 1 = [dayStart, dayStart + 15min)). Header-row-agnostic —
  // a CSS grid row (with a header row above the time axis) is this value + 1. Final
  // (post-expansion) value — see the expansion pass below.
  rowStart: number
  rowSpan: number
  // 0-based index into `visibleRooms` — the room-columns equivalent of rowStart/rowSpan.
  columnStart: number
  columnSpan: number
}

export type { HourMark }

export interface DanceScheduleLayout {
  visibleRooms: string[]
  totalRowUnits: number
  hourMarks: HourMark[]
  // Row-start positions only (no label) for the half-hour tick between each pair of
  // hour marks in the sticky time axis.
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
  placements: DanceSessionPlacement[]
}

const EMPTY_LAYOUT: DanceScheduleLayout = {
  visibleRooms: [],
  totalRowUnits: 0,
  hourMarks: [],
  halfHourMarks: [],
  elisionMarkers: [],
  expansionMarkers: [],
  placements: [],
}

const measureWidth = (text: string) => measureTextWidth(text, DETAILS_MEASUREMENT_FONT)

// A placement's card can be estimated to need more vertical space than its real,
// time-proportional rowSpan provides (see docs/known-issues.md's "long wrapping text
// clips on very short sessions") — collects one RowExpansion per overflowing
// non-roomless placement, in this axis's own (pre-expansion) row-unit space.
// Roomless cards are out of scope: .roomlessCard doesn't even have overflow: hidden
// today, so this isn't the same failure mode .card has.
function collectRowExpansions(
  placements: DanceSessionPlacement[],
  showGca: boolean,
  unitHeightPx: number,
): RowExpansion[] {
  const expansions: RowExpansion[] = []
  for (const placement of placements) {
    const { session, rowStart, rowSpan, columnSpan } = placement
    if (session.location.kind === 'roomless') {
      continue
    }
    const gca = formatSessionGca(session)
    const expansion = estimateCardRowExpansion(
      {
        primaryText: formatSessionLevels(session),
        detailsText: detailsPlainText(session),
        hasGcaLine: showGca && !!gca,
        availableHeightPx: rowSpan * unitHeightPx,
        textWidthPx: roomTextWidthPx(columnSpan),
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

// Rooms in the order they first appear across `dateSessions` (already chronologically
// sorted, per buildDanceSchedule's contract) — because of how the parser builds a
// session's `rooms` list (default single-room, or left-to-right ditto chaining), this
// reconstructs the source spreadsheet's header-column order without it being stored
// anywhere explicitly. A roomless session contributes no rooms.
function deriveRoomOrder(dateSessions: DanceSession[]): string[] {
  const rooms: string[] = []
  for (const session of dateSessions) {
    if (session.location.kind !== 'located') {
      continue
    }
    for (const room of session.location.rooms) {
      if (!rooms.includes(room)) {
        rooms.push(room)
      }
    }
  }
  return rooms
}

/**
 * Computes the time-proportional calendar grid layout for one date: which room
 * columns are visible, the day's row-unit bounds, hour-mark labels and half-hour
 * tick positions for the sticky time axis, and a placement per visible session (or
 * several, for the rare non-contiguous multi-room fallback — see
 * docs/design/dance-schedule.md).
 *
 * `dateSessions` must be every session for the date (unfiltered) — used to derive a
 * stable room order, so it never reshuffles as the level filter changes.
 * `visibleSessions` is the level-filtered subset actually rendered — the day's time
 * bounds are trimmed to its occupied range (see computeDanceScheduleTimeAxis) when
 * filtering has left leading/trailing hours entirely empty, though never past the
 * full day's own bounds. `showGca` feeds both the row-unit height (see
 * danceScheduleCardSizing.ts) and whether a GCA line counts toward a placement's
 * text-fit estimate — a card whose only reason to overflow is a GCA line it isn't
 * even showing shouldn't stretch the axis for it.
 */
export function computeDanceScheduleLayout(
  dateSessions: DanceSession[],
  visibleSessions: DanceSession[],
  showGca: boolean,
): DanceScheduleLayout {
  const timeAxis = computeDanceScheduleTimeAxis(dateSessions, visibleSessions)
  if (!timeAxis) {
    return EMPTY_LAYOUT
  }
  const { rowStartFor, rowSpanFor } = timeAxis
  const unitHeightPx = showGca ? UNIT_HEIGHT_PX_WITH_GCA : UNIT_HEIGHT_PX_WITHOUT_GCA

  const roomOrder = deriveRoomOrder(dateSessions)

  const visibleRoomSet = new Set<string>()
  for (const session of visibleSessions) {
    if (session.location.kind !== 'located') {
      continue
    }
    for (const room of session.location.rooms) {
      visibleRoomSet.add(room)
    }
  }
  const visibleRooms = roomOrder.filter((room) => visibleRoomSet.has(room))

  const placements: DanceSessionPlacement[] = []
  for (const session of visibleSessions) {
    const rowStart = rowStartFor(session.startTime)
    const rowSpan = rowSpanFor(session.startTime, session.endTime)

    if (session.location.kind === 'roomless') {
      placements.push({
        session,
        rowStart,
        rowSpan,
        columnStart: 0,
        columnSpan: Math.max(1, visibleRooms.length),
      })
      continue
    }

    const indices = session.location.rooms
      .map((room) => visibleRooms.indexOf(room))
      .filter((index) => index !== -1)
      .sort((a, b) => a - b)

    if (indices.length === 0) {
      // Defensive: shouldn't happen, since visibleRooms is derived from these same
      // visible sessions' rooms.
      continue
    }

    if (isContiguous(indices)) {
      placements.push({
        session,
        rowStart,
        rowSpan,
        columnStart: indices[0]!,
        columnSpan: indices.length,
      })
    } else {
      // Non-contiguous multi-room claim: render one block per named room rather than
      // a misleading span across rooms it doesn't occupy.
      for (const index of indices) {
        placements.push({ session, rowStart, rowSpan, columnStart: index, columnSpan: 1 })
      }
    }
  }

  placements.sort((a, b) => a.rowStart - b.rowStart || a.columnStart - b.columnStart)

  const expansions = collectRowExpansions(placements, showGca, unitHeightPx)
  const expanded = expandDanceScheduleTimeAxis(timeAxis, expansions)
  const expandedPlacements = placements.map((placement) => ({
    ...placement,
    rowStart: expanded.remapRow(placement.rowStart),
    rowSpan:
      expanded.remapRow(placement.rowStart + placement.rowSpan) -
      expanded.remapRow(placement.rowStart),
  }))

  return {
    visibleRooms,
    totalRowUnits: expanded.totalRowUnits,
    hourMarks: expanded.hourMarks,
    halfHourMarks: expanded.halfHourMarks,
    elisionMarkers: expanded.elisionMarkers,
    expansionMarkers: expanded.expansionMarkers,
    placements: expandedPlacements,
  }
}
