import type { TimeMark } from './computeDanceScheduleTimeAxis'

export interface NowLinePosition {
  // CSS grid rows (1-based, end exclusive) between the two time marks surrounding
  // "now" — i.e. `gridRow: rowStart / rowEnd`.
  rowStart: number
  rowEnd: number
  // How far (0–1) "now" sits between those two marks, measured top to bottom.
  fraction: number
}

/**
 * Converts a real instant into this app's wall-clock encoding: schedule times are
 * the spreadsheet's wall-clock values stored as UTC-anchored Dates (see
 * ScheduleList.tsx / computeDanceScheduleTimeAxis.ts), so "now" has to be the
 * device's own LOCAL date and time read as if it were UTC — comparing the raw
 * instant would be off by the viewer's UTC offset.
 */
export function toWallClockUtc(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    ),
  )
}

/**
 * Where a "current time" line belongs on a dance-schedule grid, or null when
 * `wallNow` (see toWallClockUtc) is outside the labelled range. The axis isn't a
 * linear clock (one row per session boundary, rows sized to content), so this
 * interpolates linearly only within the one segment between the two surrounding
 * labels. Marks carry full datetimes, so a different calendar day is simply out of
 * range — no separate date check needed.
 */
export function computeNowLinePosition(timeMarks: TimeMark[], wallNow: Date): NowLinePosition | null {
  const now = wallNow.getTime()
  for (let i = 0; i < timeMarks.length - 1; i++) {
    const from = timeMarks[i]!
    const to = timeMarks[i + 1]!
    const start = from.time.getTime()
    const end = to.time.getTime()
    const isLastSegment = i === timeMarks.length - 2
    // Half-open per segment so a time exactly on a label belongs to the segment it
    // starts — except the final label itself, which closes the last segment.
    if (now >= start && (now < end || (isLastSegment && now === end))) {
      return { rowStart: from.rowStart, rowEnd: to.rowStart, fraction: (now - start) / (end - start) }
    }
  }
  return null
}
