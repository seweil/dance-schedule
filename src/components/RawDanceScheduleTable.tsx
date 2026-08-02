import type { DanceSession } from '../types/danceSchedule'
import {
  computeDanceScheduleHourSummary,
  formatHours,
  type DanceScheduleHourSummaryRow,
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

function HourSummaryTable({
  caption,
  firstColumnHeading,
  dates,
  rows,
}: {
  caption: string
  firstColumnHeading: string
  dates: Date[]
  rows: DanceScheduleHourSummaryRow[]
}) {
  return (
    <section>
      <h2>{caption}</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{firstColumnHeading}</th>
            {dates.map((date) => (
              <th key={date.toISOString()}>{columnDateFormatter.format(date)}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              {row.hoursByDate.map((hours, index) => (
                <td key={dates[index]!.toISOString()}>{formatHours(hours)}</td>
              ))}
              <td>{formatHours(row.total)}</td>
            </tr>
          ))}
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
      <HourSummaryTable
        caption="Hours by level"
        firstColumnHeading="Level"
        dates={summary.dates}
        rows={summary.levelRows}
      />
      <HourSummaryTable
        caption="Hours by caller"
        firstColumnHeading="Caller"
        dates={summary.dates}
        rows={summary.callerRows}
      />
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
