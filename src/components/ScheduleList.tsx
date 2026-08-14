import { Fragment } from 'react'
import type { ScheduleEvent } from '../types/schedule'
import { groupEventsByDate } from '../lib/groupEventsByDate'
import styles from './ScheduleList.module.css'

// Event date/time values are wall-clock values as entered in the spreadsheet, encoded
// as UTC-anchored Date objects (see buildSchedule.ts) — not real instants in time. They
// must always display exactly as entered, so formatting is pinned to UTC rather than
// the viewer's local timezone — a plain (local-timezone) Intl.DateTimeFormat would shift
// the displayed date/time for any viewer outside UTC.
const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
const timeFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' })

function formatTimeRange(startTime: Date, endTime: Date): string {
  return `${timeFormatter.format(startTime)} – ${timeFormatter.format(endTime)}`
}

export function ScheduleList({ events }: { events: ScheduleEvent[] }) {
  if (events.length === 0) {
    return <p>No events scheduled.</p>
  }

  return (
    // One shared list (not one per date) so time/location/description columns align
    // across every day, not just within each day — see ScheduleList.module.css.
    <ul className={styles.list}>
      {groupEventsByDate(events).map((group) => (
        <Fragment key={group.date.toISOString()}>
          <li className={styles.dateHeading}>
            <h2>{dateFormatter.format(group.date)}</h2>
          </li>
          {group.events.map((event, index) => (
            <li
              key={event.startTime.toISOString()}
              className={`${styles.card} ${index === 0 ? '' : styles.cardDivider} ${index % 2 === 1 ? styles.cardAlt : ''}`.trim()}
            >
              <p className={styles.time}>{formatTimeRange(event.startTime, event.endTime)}</p>
              {event.location && <p className={styles.location}>{event.location}</p>}
              <p className={styles.description}>{event.description}</p>
            </li>
          ))}
        </Fragment>
      ))}
    </ul>
  )
}
