import type { ScheduleEvent, ScheduleEventData } from '../types/schedule'

function toScheduleEvent(data: ScheduleEventData): ScheduleEvent {
  return {
    date: new Date(data.date),
    startTime: new Date(data.startTime),
    endTime: new Date(data.endTime),
    location: data.location,
    description: data.description,
  }
}

// Converts the virtual:schedule module's raw (ISO-string) data into the Date-object
// shape the app renders, sorted chronologically ascending. Deliberately does not
// filter past events — that's a presentation concern, not a data-shaping one.
export function buildSchedule(data: ScheduleEventData[]): ScheduleEvent[] {
  return data
    .map(toScheduleEvent)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
}
