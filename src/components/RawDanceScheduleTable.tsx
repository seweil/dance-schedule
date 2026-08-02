import type { DanceSession } from '../types/danceSchedule'
import {
  computeDanceScheduleHourSummary,
  formatHours,
  type DanceScheduleHourSummaryTable,
} from '../lib/computeDanceScheduleHourSummary'
import { groupDanceSessionsByDate } from '../lib/groupDanceSessionsByDate'
import {
  formatSessionCallerDetails,
  formatSessionGca,
  formatSessionLevels,
  formatSessionRoom,
  formatSessionTimeRange,
} from '../lib/formatDanceSession'
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

function formatDetails(session: DanceSession): string {
  const details = formatSessionCallerDetails(session)
  return session.kind === 'freeform' ? `(freeform) ${details}` : details
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
              {group.sessions.map((session) => (
                <tr key={`${formatSessionRoom(session)}-${session.startTime.toISOString()}`}>
                  <td>{formatSessionTimeRange(session)}</td>
                  <td>{formatSessionRoom(session)}</td>
                  <td>{formatSessionLevels(session)}</td>
                  <td>{formatDetails(session)}</td>
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
