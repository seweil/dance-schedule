import type { DanceSession } from '../types/danceSchedule'

// Grid rows are 15-minute units — the GCD of the 30/45/60-minute slot lengths seen in
// the real data, so every real session's start/end lands exactly on a grid line.
// Shared by every dance-schedule grid (room-columns and level-columns) — the time
// axis itself is entirely independent of what the columns represent.
const UNIT_MINUTES = 15
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE

const hourFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' })

export interface HourMark {
  rowStart: number
  label: string
}

export interface DanceScheduleTimeAxis {
  totalRowUnits: number
  hourMarks: HourMark[]
  // Row-start positions only (no label) for the half-hour tick between each pair of
  // hour marks in the sticky time axis.
  halfHourMarks: number[]
  // 1-based index of the first 15-minute unit `time` falls in, counting from this
  // axis's own (possibly trimmed) day start — row 1 is the first unit. Header-row-
  // agnostic; a CSS grid row (with a header row above the time axis) is this value + 1.
  rowStartFor: (time: Date) => number
  rowSpanFor: (start: Date, end: Date) => number
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

// True if `sortedIndices` (ascending, deduped) form one unbroken run — shared by the
// room-columns algorithm's multi-room-span check and the level-columns algorithm's
// multi-level-span check.
export function isContiguous(sortedIndices: number[]): boolean {
  return sortedIndices.every((index, i) => i === 0 || index === sortedIndices[i - 1]! + 1)
}

// Trims fullDayStart/fullDayEnd to the visible sessions' own occupied time range,
// hour-aligned the same way the full bounds are (so hour-mark labels stay clean) —
// when the level filter has narrowed the visible set enough that leading and/or
// trailing hours are now entirely empty, that dead space is cut rather than left as
// blank rows. A gap *between* visible sessions is left alone — only genuinely
// leading/trailing empty time is trimmed, never the middle of the day. Bounded by the
// full day's own bounds (Math.max/min below), so this can only ever trim inward,
// never wider than the real day. No visible sessions at all is a no-op (irrelevant
// either way — the grid components show an empty-state message instead then).
function trimEmptyDayEdges(
  fullDayStart: Date,
  fullDayEnd: Date,
  visibleSessions: DanceSession[],
): { dayStart: Date; dayEnd: Date } {
  if (visibleSessions.length === 0) {
    return { dayStart: fullDayStart, dayEnd: fullDayEnd }
  }

  const earliestVisibleStart = new Date(Math.min(...visibleSessions.map((s) => s.startTime.getTime())))
  const latestVisibleEnd = new Date(Math.max(...visibleSessions.map((s) => s.endTime.getTime())))

  return {
    dayStart: new Date(Math.max(fullDayStart.getTime(), floorToHour(earliestVisibleStart).getTime())),
    dayEnd: new Date(Math.min(fullDayEnd.getTime(), ceilToHour(latestVisibleEnd).getTime())),
  }
}

/**
 * Computes the shared time-row half of a dance-schedule grid layout: the day's
 * row-unit bounds (trimmed toward the visible sessions' own occupied range, per
 * trimEmptyDayEdges above), hour-mark labels and half-hour tick positions for the
 * sticky time axis, and rowStartFor/rowSpanFor helpers for converting a session's
 * start/end time into grid-row coordinates. Column semantics (rooms, levels, ...)
 * are entirely the caller's concern — this knows nothing about them.
 *
 * `dateSessions` must be every session for the date (unfiltered) — used for the
 * full-day bounds before trimming. `visibleSessions` is the level-filtered subset
 * actually rendered. Returns null when `dateSessions` is empty (nothing to show).
 */
export function computeDanceScheduleTimeAxis(
  dateSessions: DanceSession[],
  visibleSessions: DanceSession[],
): DanceScheduleTimeAxis | null {
  if (dateSessions.length === 0) {
    return null
  }

  const fullDayStart = floorToHour(
    new Date(Math.min(...dateSessions.map((session) => session.startTime.getTime()))),
  )
  const fullDayEnd = ceilToHour(
    new Date(Math.max(...dateSessions.map((session) => session.endTime.getTime()))),
  )
  const { dayStart, dayEnd } = trimEmptyDayEdges(fullDayStart, fullDayEnd, visibleSessions)
  const totalRowUnits = Math.round((dayEnd.getTime() - dayStart.getTime()) / (UNIT_MINUTES * MS_PER_MINUTE))

  const rowStartFor = (time: Date): number =>
    Math.round((time.getTime() - dayStart.getTime()) / (UNIT_MINUTES * MS_PER_MINUTE)) + 1
  const rowSpanFor = (start: Date, end: Date): number =>
    Math.max(1, Math.round((end.getTime() - start.getTime()) / (UNIT_MINUTES * MS_PER_MINUTE)))

  const hourMarks: HourMark[] = []
  for (let t = dayStart.getTime(); t <= dayEnd.getTime(); t += MS_PER_HOUR) {
    const time = new Date(t)
    hourMarks.push({ rowStart: rowStartFor(time), label: hourFormatter.format(time) })
  }

  const halfHourMarks: number[] = []
  for (let t = dayStart.getTime() + MS_PER_HOUR / 2; t < dayEnd.getTime(); t += MS_PER_HOUR) {
    halfHourMarks.push(rowStartFor(new Date(t)))
  }

  return { totalRowUnits, hourMarks, halfHourMarks, rowStartFor, rowSpanFor }
}
