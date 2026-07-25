import type { DanceSession } from '../types/danceSchedule'

// Grid rows are 15-minute units — the GCD of the 30/45/60-minute slot lengths seen in
// the real data, so every real session's start/end lands exactly on a grid line.
const UNIT_MINUTES = 15
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE

const hourFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' })

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

export interface HourMark {
  rowStart: number
  label: string
}

export interface DanceScheduleLayout {
  visibleRooms: string[]
  totalRowUnits: number
  hourMarks: HourMark[]
  placements: DanceSessionPlacement[]
}

const EMPTY_LAYOUT: DanceScheduleLayout = {
  visibleRooms: [],
  totalRowUnits: 0,
  hourMarks: [],
  placements: [],
}

function floorToHour(date: Date): Date {
  const result = new Date(date)
  result.setUTCMinutes(0, 0, 0)
  return result
}

function ceilToHour(date: Date): Date {
  const floored = floorToHour(date)
  return floored.getTime() === date.getTime() ? floored : new Date(floored.getTime() + MS_PER_HOUR)
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

function isContiguous(sortedIndices: number[]): boolean {
  return sortedIndices.every((index, i) => i === 0 || index === sortedIndices[i - 1]! + 1)
}

/**
 * Computes the time-proportional calendar grid layout for one date: which room
 * columns are visible, the day's row-unit bounds, hour-mark labels for the sticky
 * time axis, and a placement per visible session (or several, for the rare
 * non-contiguous multi-room fallback — see docs/design/dance-schedule.md).
 *
 * `dateSessions` must be every session for the date (unfiltered) — used to derive a
 * stable room order and fixed time bounds, so neither reshuffles/jumps as the level
 * filter changes. `visibleSessions` is the level-filtered subset actually rendered.
 */
export function computeDanceScheduleLayout(
  dateSessions: DanceSession[],
  visibleSessions: DanceSession[],
): DanceScheduleLayout {
  if (dateSessions.length === 0) {
    return EMPTY_LAYOUT
  }

  const dayStart = floorToHour(
    new Date(Math.min(...dateSessions.map((session) => session.startTime.getTime()))),
  )
  const dayEnd = ceilToHour(
    new Date(Math.max(...dateSessions.map((session) => session.endTime.getTime()))),
  )
  const totalRowUnits = Math.round((dayEnd.getTime() - dayStart.getTime()) / (UNIT_MINUTES * MS_PER_MINUTE))

  const rowStartFor = (time: Date): number =>
    Math.round((time.getTime() - dayStart.getTime()) / (UNIT_MINUTES * MS_PER_MINUTE)) + 1
  const rowSpanFor = (start: Date, end: Date): number =>
    Math.max(1, Math.round((end.getTime() - start.getTime()) / (UNIT_MINUTES * MS_PER_MINUTE)))

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

  const hourMarks: HourMark[] = []
  for (let t = dayStart.getTime(); t <= dayEnd.getTime(); t += MS_PER_HOUR) {
    const time = new Date(t)
    hourMarks.push({ rowStart: rowStartFor(time), label: hourFormatter.format(time) })
  }

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

  return { visibleRooms, totalRowUnits, hourMarks, placements }
}
