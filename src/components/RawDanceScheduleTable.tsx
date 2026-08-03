import type { ReactNode } from 'react'
import type { DanceSession } from '../types/danceSchedule'
import {
  computeDanceScheduleHourSummary,
  formatHours,
  type DanceScheduleHourSummaryTable,
} from '../lib/computeDanceScheduleHourSummary'
import { groupDanceSessionsByDate } from '../lib/groupDanceSessionsByDate'
import {
  formatSessionGca,
  formatSessionLevels,
  formatSessionRoom,
  formatSessionTimeRange,
} from '../lib/formatDanceSession'
import { colorForSession, NEUTRAL_CARD_COLOR } from '../lib/levelColors'
import styles from './RawDanceScheduleTable.module.css'

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' })
// Short enough to use as a table column header, unlike dateFormatter's full form —
// matches DanceScheduleFilters.tsx's own date-select convention.
const columnDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

// Ties (multiple rooms sharing the same start time) break on room name, so row
// order is stable and predictable rather than an artifact of spreadsheet row order.
function compareSessions(a: DanceSession, b: DanceSession): number {
  const timeDiff = a.startTime.getTime() - b.startTime.getTime()
  return timeDiff !== 0 ? timeDiff : formatSessionRoom(a).localeCompare(formatSessionRoom(b))
}

// Mirrors formatSessionCallerDetails, but as JSX so the headline caller (not
// GCA, which gets its own column) can be bolded — matching the real display
// page's session cards (danceScheduleCardContent.tsx). Otherwise stays an
// unfiltered, faithful echo of the parsed data (e.g. "Dancing" isn't
// suppressed the way the real cards do), matching this table's existing role
// as a raw dump.
function detailsContent(session: DanceSession): ReactNode {
  if (session.kind === 'freeform') {
    return `(freeform) ${session.description}`
  }
  return (
    <>
      {session.eventType} - <strong>{session.callers.join(' & ')}</strong>
    </>
  )
}

interface DateRow {
  session: DanceSession
  shadeTimeCell: boolean
  isBlockStart: boolean
}

// Alternates a shade in the Time column for each distinct block of
// same-start-time rows (so a busy multi-room time slot reads as one visual
// group at a glance instead of a wall of identical timestamps), and flags
// each block's first row so the caller can draw a heavier rule between time
// slots than the ordinary row/room grid lines.
function buildDateRows(sessions: DanceSession[]): DateRow[] {
  const sorted = [...sessions].sort(compareSessions)
  let shaded = false
  let previousTime: number | undefined
  return sorted.map((session) => {
    const time = session.startTime.getTime()
    const isBlockStart = time !== previousTime
    if (isBlockStart) {
      shaded = !shaded
      previousTime = time
    }
    return { session, shadeTimeCell: shaded, isBlockStart }
  })
}

// One row per date (plus a final Total row), one column per level/caller (plus a
// final Total column) — a day-by-day cross-tab, transposed from
// computeDanceScheduleHourSummary's own column-oriented shape (one entry per
// level/caller, an hours-by-date array within it) purely at render time.
function HourSummaryTable({
  caption,
  dates,
  table,
}: {
  caption: string
  dates: Date[]
  table: DanceScheduleHourSummaryTable
}) {
  return (
    <section>
      <h2>{caption}</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            {table.columns.map((column) => (
              <th key={column.label}>{column.label}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((date, dateIndex) => (
            <tr key={date.toISOString()}>
              <td>{columnDateFormatter.format(date)}</td>
              {table.columns.map((column) => (
                <td key={column.label}>{formatHours(column.hoursByDate[dateIndex]!)}</td>
              ))}
              <td>{formatHours(table.totalByDate[dateIndex]!)}</td>
            </tr>
          ))}
          <tr>
            <td>Total</td>
            {table.columns.map((column) => (
              <td key={column.label}>{formatHours(column.total)}</td>
            ))}
            <td>{formatHours(table.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

// Dense, desktop-only debug view of the parsed dance schedule — one table per
// date, mirroring formatDanceScheduleMarkdown.ts's dump so both stay consistent.
// Not styled or tested for mobile; this is a debug tool, not the eventual page.
export function RawDanceScheduleTable({ sessions }: { sessions: DanceSession[] }) {
  if (sessions.length === 0) {
    return <p>No sessions parsed.</p>
  }

  const summary = computeDanceScheduleHourSummary(sessions)

  return (
    <>
      <HourSummaryTable caption="Hours by level" dates={summary.dates} table={summary.levels} />
      <HourSummaryTable caption="Hours by caller" dates={summary.dates} table={summary.callers} />
      {groupDanceSessionsByDate(sessions).map((group) => (
        <section key={group.date.toISOString()}>
          <h2>{dateFormatter.format(group.date)}</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Room</th>
                <th>Level(s)</th>
                <th>Details</th>
                <th>GCA</th>
              </tr>
            </thead>
            <tbody>
              {buildDateRows(group.sessions).map(({ session, shadeTimeCell, isBlockStart }) => (
                <tr
                  key={`${formatSessionRoom(session)}-${session.startTime.toISOString()}`}
                  className={isBlockStart ? styles.timeBlockStart : undefined}
                  // A freeform row (e.g. a lunch break) has no level of its own to
                  // color-code, so the whole row gets the same neutral shade
                  // colorForSession would give its (nonexistent) Level(s) cell —
                  // matching how the real grids shade a freeform/roomless card.
                  style={session.kind === 'freeform' ? { backgroundColor: NEUTRAL_CARD_COLOR } : undefined}
                >
                  {/* Skipped on a freeform row — its own neutral shading above takes
                      precedence over the alternating block shade, since a cell's own
                      background always paints over its row's. */}
                  <td className={session.kind !== 'freeform' && shadeTimeCell ? styles.timeBlockShaded : undefined}>
                    {formatSessionTimeRange(session)}
                  </td>
                  <td>{formatSessionRoom(session)}</td>
                  <td style={session.kind === 'structured' ? { backgroundColor: colorForSession(session) } : undefined}>
                    {formatSessionLevels(session)}
                  </td>
                  <td>{detailsContent(session)}</td>
                  <td>{formatSessionGca(session)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  )
}
