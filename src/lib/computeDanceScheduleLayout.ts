import { computeDanceScheduleTimeAxis, isContiguous, type TimeMark } from './computeDanceScheduleTimeAxis'
import { deriveRoomOrder, type RoomOrderConfig } from './deriveRoomOrder'
import type { DanceSession } from '../types/danceSchedule'

// Fixed, not minmax(150px, 1fr) — see the .grid comment in DanceScheduleGrid.module.css
// for why a flexible track can't be trusted to resolve identically across that
// component's two separate grid containers (header vs. body). rem, not px — so this
// grows along with the text-size preference (useTextSizePreference.ts) instead of
// staying visually fixed while every card's own text scales past it, which used to
// make room headers elide harder and card text wrap more at Large/Extra Large than
// at Normal (see docs/design/text-size-preference.md). 9.375rem is the same
// physical width px 150 always was, at the unscaled 100% root font-size.
export const ROOM_COLUMN_WIDTH_REM = 9.375
export const ROOM_COLUMN_WIDTH = `${ROOM_COLUMN_WIDTH_REM}rem`

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

/**
 * Computes the calendar grid layout for one date: which room columns are visible,
 * the shared time-axis tick marks, and a placement per visible session (or several,
 * for the rare non-contiguous multi-room fallback — see docs/design/dance-schedule.md).
 *
 * `allSessions` must be every session across the WHOLE EVENT (every date, not just
 * the one being rendered) — room order is computed globally, once, from this full
 * set (see deriveRoomOrder.ts), so it's identical on every date, not just stable
 * as the level filter changes within one date. `visibleSessions` is this date's
 * level-filtered subset actually rendered — the ONLY input to the time axis itself
 * (see computeDanceScheduleTimeAxis), so the axis always matches exactly what's on
 * screen. `roomOrderConfig` is content/<set>/config.yaml's `danceSchedule.roomOrder`
 * — see deriveRoomOrder.ts for what each value means; `undefined` (the common
 * case) gets the new median-dance-level default.
 */
export function computeDanceScheduleLayout(
  allSessions: DanceSession[],
  visibleSessions: DanceSession[],
  roomOrderConfig?: RoomOrderConfig,
): DanceScheduleLayout {
  const timeAxis = computeDanceScheduleTimeAxis(visibleSessions)
  if (!timeAxis) {
    return EMPTY_LAYOUT
  }
  const { rowStartFor, rowSpanFor } = timeAxis

  const roomOrder = deriveRoomOrder(allSessions, roomOrderConfig)

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
