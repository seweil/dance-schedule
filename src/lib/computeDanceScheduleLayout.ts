import { computeDanceScheduleTimeAxis, isContiguous, type HourMark } from './computeDanceScheduleTimeAxis'
import type { DanceSession } from '../types/danceSchedule'

export interface DanceSessionPlacement {
  session: DanceSession
  // 1-based index of the first 15-minute unit this placement occupies, counting from
  // the grid's dayStart (row 1 = [dayStart, dayStart + 15min)). Header-row-agnostic —
  // a CSS grid row (with a header row above the time axis) is this value + 1.
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
  placements: DanceSessionPlacement[]
}

const EMPTY_LAYOUT: DanceScheduleLayout = {
  visibleRooms: [],
  totalRowUnits: 0,
  hourMarks: [],
  halfHourMarks: [],
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
 * full day's own bounds.
 */
export function computeDanceScheduleLayout(
  dateSessions: DanceSession[],
  visibleSessions: DanceSession[],
): DanceScheduleLayout {
  const timeAxis = computeDanceScheduleTimeAxis(dateSessions, visibleSessions)
  if (!timeAxis) {
    return EMPTY_LAYOUT
  }
  const { totalRowUnits, hourMarks, halfHourMarks, rowStartFor, rowSpanFor } = timeAxis

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

  return { visibleRooms, totalRowUnits, hourMarks, halfHourMarks, placements }
}
