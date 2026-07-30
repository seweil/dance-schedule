import type { DanceSession } from '../types/danceSchedule'

// Grid rows are 15-minute units — the GCD of the 30/45/60-minute slot lengths seen in
// the real data, so every real session's start/end lands exactly on a grid line.
// Shared by every dance-schedule grid (room-columns and level-columns) — the time
// axis itself is entirely independent of what the columns represent.
const UNIT_MINUTES = 15
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const UNIT_MS = UNIT_MINUTES * MS_PER_MINUTE

// A roomless session (spans every column — e.g. a meal break) can run much longer
// than an ordinary dance session. Showing it at full scale would push everything
// scheduled afterward far down the page for no benefit — there's nothing else to
// see during it. Beyond this many rows (1 hour) of a roomless session's own span,
// the *excess* real time is elided entirely from the axis: every later row
// position on the day shifts up by the elided amount, genuinely reducing how far
// the grid scrolls, not just how one card looks. A session's own rowSpan is never
// separately clipped — it's simply however many (already-compressed) rows its
// real start/end maps to, exactly like any other session; see findElisionIntervals
// and the `compress` closure below. A "scale break" zigzag marker renders in the
// sticky time column at the elision point instead (DanceScheduleGrid.tsx's
// ElisionMarker, `elisionMarkers` below) — the card itself carries no visual
// indicator of its own.
const MAX_ROOMLESS_VISIBLE_UNITS = MS_PER_HOUR / UNIT_MS

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
  // Row-start positions (in this axis's own, already-compressed row space) where a
  // "scale break" marker should render in the sticky time column — one per elided
  // roomless session. Always empty when nothing qualifies for elision.
  elisionMarkers: number[]
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

interface ElisionInterval {
  // Raw (uncompressed) ms timestamps of the elided stretch — [start, end).
  start: number
  end: number
}

// Finds the excess-duration stretch of every roomless session over 1 hour long —
// only when nothing else is scheduled during that excess portion. Eliding time
// some other (non-roomless) session occupies would corrupt that session's own
// row position, so it's safer to leave that one interval un-elided (shown at full
// scale) than risk that; this is a real possibility this function must guard
// against, not just a hypothetical, since nothing elsewhere in the pipeline
// guarantees a roomless session's time range is otherwise empty.
function findElisionIntervals(dateSessions: DanceSession[]): ElisionInterval[] {
  const intervals: ElisionInterval[] = []

  for (const session of dateSessions) {
    if (session.location.kind !== 'roomless') {
      continue
    }
    const excessStart = session.startTime.getTime() + MAX_ROOMLESS_VISIBLE_UNITS * UNIT_MS
    const excessEnd = session.endTime.getTime()
    if (excessEnd <= excessStart) {
      continue // 1 hour or less — nothing to elide
    }

    const blocked = dateSessions.some(
      (other) =>
        other !== session &&
        other.startTime.getTime() < excessEnd &&
        other.endTime.getTime() > excessStart,
    )
    if (blocked) {
      continue
    }

    intervals.push({ start: excessStart, end: excessEnd })
  }

  return intervals.sort((a, b) => a.start - b.start)
}

/**
 * Computes the shared time-row half of a dance-schedule grid layout: the day's
 * row-unit bounds (trimmed toward the visible sessions' own occupied range, per
 * trimEmptyDayEdges above, and compressed to elide a long roomless session's excess
 * duration, per findElisionIntervals above), hour-mark labels and half-hour tick
 * positions for the sticky time axis, and rowStartFor/rowSpanFor helpers for
 * converting a session's start/end time into grid-row coordinates. Column
 * semantics (rooms, levels, ...) are entirely the caller's concern — this knows
 * nothing about them.
 *
 * `dateSessions` must be every session for the date (unfiltered) — used for the
 * full-day bounds and elision candidates before trimming. `visibleSessions` is the
 * level-filtered subset actually rendered. Returns null when `dateSessions` is
 * empty (nothing to show).
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

  const rawUnitFor = (time: Date): number => Math.round((time.getTime() - dayStart.getTime()) / UNIT_MS)

  // Elision intervals, converted into raw row-unit space (rounded the same way
  // every other row computation already is) and clamped to this axis's own
  // [0, totalRawUnits] bounds.
  const totalRawUnits = rawUnitFor(dayEnd)
  const rawElisions = findElisionIntervals(dateSessions)
    .map((interval) => ({
      rawStart: Math.max(0, rawUnitFor(new Date(interval.start))),
      rawEnd: Math.min(totalRawUnits, rawUnitFor(new Date(interval.end))),
    }))
    .filter((interval) => interval.rawEnd > interval.rawStart)

  // Subtracts however many rows have already been elided strictly before
  // `rawUnits` — the actual "shift everything after an elision up" mechanism.
  // rawElisions is sorted ascending and (by construction, roomless sessions don't
  // overlap each other) non-overlapping, so a simple cumulative walk suffices.
  // An identity (no-op) when rawElisions is empty — an ordinary day's math is
  // completely unchanged.
  const compress = (rawUnits: number): number => {
    let removed = 0
    for (const elision of rawElisions) {
      if (rawUnits <= elision.rawStart) {
        break
      }
      removed += Math.min(rawUnits, elision.rawEnd) - elision.rawStart
    }
    return rawUnits - removed
  }

  const totalRowUnits = compress(totalRawUnits)

  const rowStartFor = (time: Date): number => compress(rawUnitFor(time)) + 1
  const rowSpanFor = (start: Date, end: Date): number =>
    Math.max(1, compress(rawUnitFor(end)) - compress(rawUnitFor(start)))

  const hourMarks: HourMark[] = []
  for (let t = dayStart.getTime(); t <= dayEnd.getTime(); t += MS_PER_HOUR) {
    const time = new Date(t)
    const rowStart = rowStartFor(time)
    // An hour that lands inside an elided stretch compresses to the exact same row
    // as the elision's own start boundary — dedupe rather than stack duplicate
    // labels on top of each other at that row.
    if (hourMarks.length > 0 && hourMarks[hourMarks.length - 1]!.rowStart === rowStart) {
      continue
    }
    hourMarks.push({ rowStart, label: hourFormatter.format(time) })
  }

  const halfHourMarks: number[] = []
  for (let t = dayStart.getTime() + MS_PER_HOUR / 2; t < dayEnd.getTime(); t += MS_PER_HOUR) {
    const rowStart = rowStartFor(new Date(t))
    if (halfHourMarks.length > 0 && halfHourMarks[halfHourMarks.length - 1] === rowStart) {
      continue
    }
    halfHourMarks.push(rowStart)
  }

  const elisionMarkers = rawElisions.map((elision) => compress(elision.rawStart) + 1)

  return { totalRowUnits, hourMarks, halfHourMarks, elisionMarkers, rowStartFor, rowSpanFor }
}
