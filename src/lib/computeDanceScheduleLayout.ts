import { computeDanceScheduleTimeAxis, isContiguous, type TimeMark } from './computeDanceScheduleTimeAxis'
import { CARD_HORIZONTAL_OVERHEAD_PX } from './danceScheduleCardSizing'
import type { DanceSession } from '../types/danceSchedule'

// Fixed, not minmax(150px, 1fr) — see the .grid comment in DanceScheduleGrid.module.css
// for why a flexible track can't be trusted to resolve identically across that
// component's two separate grid containers (header vs. body). Lives here (not the
// component) so the component's combine-text-onto-one-line check uses the same
// formula this file would if it ever needed the width itself, not two copies that
// could drift.
export const ROOM_COLUMN_WIDTH_PX = 150
export const ROOM_COLUMN_WIDTH = `${ROOM_COLUMN_WIDTH_PX}px`

export function roomTextWidthPx(columnSpan: number): number {
  return columnSpan * ROOM_COLUMN_WIDTH_PX - CARD_HORIZONTAL_OVERHEAD_PX
}

export interface DanceSessionPlacement {
  session: DanceSession
  // 1-based row index of the axis tick this placement starts at (see
  // computeDanceScheduleTimeAxis.ts) — header-row-agnostic; a CSS grid row (with a
  // header row above the time axis) is this value + 1.
  rowStart: number
  rowSpan: number
  // 0-based index into `visibleRooms` — the room-columns equivalent of rowStart/rowSpan.
  columnStart: number
  columnSpan: number
}

export type { TimeMark }

export interface DanceScheduleLayout {
  visibleRooms: string[]
  totalRows: number
  // One mark per distinct time some visible session starts/ends at — see
  // computeDanceScheduleTimeAxis.ts's DanceScheduleTimeAxis.timeMarks.
  timeMarks: TimeMark[]
  placements: DanceSessionPlacement[]
}

const EMPTY_LAYOUT: DanceScheduleLayout = {
  visibleRooms: [],
  totalRows: 0,
  timeMarks: [],
  placements: [],
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
 * Computes the calendar grid layout for one date: which room columns are visible,
 * the shared time-axis tick marks, and a placement per visible session (or several,
 * for the rare non-contiguous multi-room fallback — see docs/design/dance-schedule.md).
 *
 * `dateSessions` must be every session for the date (unfiltered) — used only to
 * derive a stable room order, so it never reshuffles as the level filter changes.
 * `visibleSessions` is the level-filtered subset actually rendered — the ONLY input
 * to the time axis itself (see computeDanceScheduleTimeAxis), so the axis always
 * matches exactly what's on screen.
 */
export function computeDanceScheduleLayout(
  dateSessions: DanceSession[],
  visibleSessions: DanceSession[],
): DanceScheduleLayout {
  const timeAxis = computeDanceScheduleTimeAxis(visibleSessions)
  if (!timeAxis) {
    return EMPTY_LAYOUT
  }
  const { rowStartFor, rowSpanFor } = timeAxis

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

  return {
    visibleRooms,
    totalRows: timeAxis.totalRows,
    timeMarks: timeAxis.timeMarks,
    placements,
  }
}
