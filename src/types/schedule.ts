// Shape crossing the virtual:schedule module boundary — dates as ISO strings,
// since Date objects can't survive being embedded in generated JS source via
// JSON.stringify.
export interface ScheduleEventData {
  date: string
  startTime: string
  endTime: string
  // Optional — not every event has a fixed location (e.g. an all-day activity, or
  // one that moves between rooms). See ScheduleList.tsx for how a missing location
  // is rendered (the field is simply omitted, not shown as blank).
  location: string | undefined
  description: string
}

// Shape the rest of the app consumes, produced by buildSchedule().
export interface ScheduleEvent {
  date: Date
  startTime: Date
  endTime: Date
  location: string | undefined
  description: string
}
