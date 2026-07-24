import type { DanceSession, DanceSessionData } from '../types/danceSchedule'

function toDanceSession(data: DanceSessionData): DanceSession {
  const base = {
    date: new Date(data.date),
    startTime: new Date(data.startTime),
    endTime: new Date(data.endTime),
    location: data.location,
  }

  if (data.kind === 'freeform') {
    return { kind: 'freeform', ...base, description: data.description }
  }

  return {
    kind: 'structured',
    ...base,
    levels: data.levels,
    eventType: data.eventType,
    callers: data.callers,
    gca: data.gca,
  }
}

// Converts the virtual:dance-schedule module's raw (ISO-string) data into the
// Date-object shape the app renders, sorted chronologically ascending — mirrors
// buildSchedule.ts's pattern exactly.
export function buildDanceSchedule(data: DanceSessionData[]): DanceSession[] {
  return data
    .map(toDanceSession)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
}
