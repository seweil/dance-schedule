// Shape crossing the virtual:schedule module boundary — dates as ISO strings,
// since Date objects can't survive being embedded in generated JS source via
// JSON.stringify.
export interface ScheduleEventData {
  date: string
  startTime: string
  endTime: string
  location: string
  description: string
}

// Shape the rest of the app consumes, produced by buildSchedule().
export interface ScheduleEvent {
  date: Date
  startTime: Date
  endTime: Date
  location: string
  description: string
}
