import type { DanceSession } from '../types/danceSchedule'
import { groupDanceSessionsByDate } from '../lib/groupDanceSessionsByDate'
import styles from './RawDanceScheduleTable.module.css'

// Session date/time values are wall-clock values from the spreadsheet, not real
// instants (see buildDanceSchedule.ts) — pinned to UTC so they display exactly
// as entered, same reasoning as ScheduleList.tsx.
const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' })
const timeFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' })

function formatTimeRange(session: DanceSession): string {
  return `${timeFormatter.format(session.startTime)} – ${timeFormatter.format(session.endTime)}`
}

function formatDetails(session: DanceSession): string {
  if (session.kind === 'freeform') {
    return `(freeform) ${session.description}`
  }
  return `${session.eventType} - ${session.callers.join(' & ')}`
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
                <tr key={`${session.room}-${session.startTime.toISOString()}`}>
                  <td>{formatTimeRange(session)}</td>
                  <td>{session.room}</td>
                  <td>{session.kind === 'structured' ? session.levels.join(', ') : ''}</td>
                  <td>{formatDetails(session)}</td>
                  <td>{session.kind === 'structured' ? (session.gca ?? '') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  )
}
