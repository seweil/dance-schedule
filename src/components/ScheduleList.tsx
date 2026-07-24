import type { ScheduleEvent } from '../types/schedule'
import styles from './ScheduleList.module.css'

// Event date/time values are wall-clock values as entered in the spreadsheet, encoded
// as UTC-anchored Date objects (see buildSchedule.ts) — not real instants in time. They
// must always display exactly as entered, so formatting is pinned to UTC rather than
// the viewer's local timezone (the shared formatDisplayDate util isn't used here for
// that reason — it formats in the viewer's local time, which is correct for a generic
// "current date" display but wrong for an event date that shouldn't shift by timezone).
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
    <ul className={styles.list}>
      {events.map((event) => (
        <li key={event.startTime.toISOString()} className={styles.card}>
          <p className={styles.date}>{dateFormatter.format(event.date)}</p>
          <p className={styles.time}>{formatTimeRange(event.startTime, event.endTime)}</p>
          <p className={styles.location}>{event.location}</p>
          <p className={styles.description}>{event.description}</p>
        </li>
      ))}
    </ul>
  )
}
