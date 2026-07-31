import type { DanceSession } from '../types/danceSchedule'

const hourFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' })

export interface TimeMark {
  rowStart: number
  label: string
}

export interface DanceScheduleTimeAxis {
  totalRows: number
  // One mark per distinct time some visible session actually starts or ends at —
  // never a fixed clock grid. See docs/design/dance-schedule.md's "the axis is not
  // a clock" decision for why: every mark is, by construction, a real event
  // boundary, so there's no conditional-inclusion logic here at all.
  timeMarks: TimeMark[]
  // 1-based row position of `time`, which must itself be some visible session's own
  // startTime/endTime — this axis has no notion of any other point in time.
  // Header-row-agnostic; a CSS grid row (with a header row above the time axis) is
  // this value + 1.
  rowStartFor: (time: Date) => number
  rowSpanFor: (start: Date, end: Date) => number
}

// True if `sortedIndices` (ascending, deduped) form one unbroken run — shared by the
// room-columns algorithm's multi-room-span check and the level-columns algorithm's
// multi-level-span check. Purely about column indices, unrelated to time.
export function isContiguous(sortedIndices: number[]): boolean {
  return sortedIndices.every((index, i) => i === 0 || index === sortedIndices[i - 1]! + 1)
}

/**
 * Computes the shared time-row half of a dance-schedule grid layout: not a clock
 * grid, just the ordered sequence of distinct times some currently-visible session
 * actually starts or ends at. Consecutive ticks become one grid row each — NOT
 * scaled to real elapsed minutes, so a 3-hour gap with nothing scheduled in it and a
 * 15-minute gap are both exactly one row. A single long event that spans several
 * shorter events in another room naturally gets a taller rowSpan than any one of
 * them, purely because those other sessions' own boundaries are additional ticks
 * that fall inside its span — no special-casing needed (see
 * docs/design/dance-schedule.md and computeDanceScheduleTimeAxis.test.ts's
 * "spans several other events" case).
 *
 * `visibleSessions` is the level-filtered subset actually rendered — the axis only
 * ever reflects what's on screen, matching the level filter exactly. Column
 * semantics (rooms, levels, ...) are entirely the caller's concern — this knows
 * nothing about them. Returns null when `visibleSessions` is empty (nothing to
 * show).
 */
export function computeDanceScheduleTimeAxis(
  visibleSessions: DanceSession[],
): DanceScheduleTimeAxis | null {
  if (visibleSessions.length === 0) {
    return null
  }

  const tickTimes = [
    ...new Set(visibleSessions.flatMap((session) => [session.startTime.getTime(), session.endTime.getTime()])),
  ].sort((a, b) => a - b)

  const rowIndexByTime = new Map(tickTimes.map((t, index) => [t, index]))

  // Every real caller only ever passes a session's own startTime/endTime — both are
  // themselves tick times by construction (that's how tickTimes was built), so this
  // lookup always succeeds.
  const rowStartFor = (time: Date): number => rowIndexByTime.get(time.getTime())! + 1

  const rowSpanFor = (start: Date, end: Date): number =>
    Math.max(1, rowStartFor(end) - rowStartFor(start))

  const timeMarks: TimeMark[] = tickTimes.map((t, index) => ({
    rowStart: index + 1,
    label: hourFormatter.format(new Date(t)),
  }))

  return { totalRows: tickTimes.length - 1, timeMarks, rowStartFor, rowSpanFor }
}
