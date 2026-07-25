import type { DanceSession } from '../types/danceSchedule'
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

function formatDetails(session: DanceSession): string {
  const details = formatSessionCallerDetails(session)
  return session.kind === 'freeform' ? `(freeform) ${details}` : details
}

// Dense, desktop-only debug view of the parsed dance schedule — one table per
// date, mirroring formatDanceScheduleMarkdown.ts's dump so both stay consistent.
// Not styled or tested for mobile; this is a debug tool, not the eventual page.
export function RawDanceScheduleTable({ sessions }: { sessions: DanceSession[] }) {
  if (sessions.length === 0) {
    return <p>No sessions parsed.</p>
  }

  return (
    <>
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
