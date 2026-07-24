import type { ScheduleEvent } from '../types/schedule'

export interface ScheduleDateGroup {
  date: Date
  events: ScheduleEvent[]
}

// Groups events by calendar date for rendering one date-section heading per day.
// Assumes events are already chronologically sorted (true of buildSchedule's output),
// so consecutive same-date events land in the same group and groups come out in
// date order without needing to re-sort here.
export function groupEventsByDate(events: ScheduleEvent[]): ScheduleDateGroup[] {
  const groups: ScheduleDateGroup[] = []
  let currentGroup: ScheduleDateGroup | undefined

  for (const event of events) {
    if (!currentGroup || currentGroup.date.getTime() !== event.date.getTime()) {
      currentGroup = { date: event.date, events: [] }
      groups.push(currentGroup)
    }
    currentGroup.events.push(event)
  }

  return groups
}
