import type { DetailedSession, DetailedSessionData } from '../types/detailedSchedule'

function toDetailedSession(data: DetailedSessionData): DetailedSession {
  const base = {
    date: new Date(data.date),
    startTime: new Date(data.startTime),
    endTime: new Date(data.endTime),
    room: data.room,
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

// Converts the virtual:detailed-schedule module's raw (ISO-string) data into the
// Date-object shape the app renders, sorted chronologically ascending — mirrors
// buildSchedule.ts's pattern exactly.
export function buildDetailedSchedule(data: DetailedSessionData[]): DetailedSession[] {
  return data
    .map(toDetailedSession)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
}
