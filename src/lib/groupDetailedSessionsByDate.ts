import type { DetailedSession } from '../types/detailedSchedule'

export interface DetailedSessionDateGroup {
  date: Date
  sessions: DetailedSession[]
}

// Groups sessions by calendar date, mirroring groupEventsByDate.ts's pattern.
// Assumes sessions are already chronologically sorted (true of
// buildDetailedSchedule's output), so consecutive same-date sessions land in the
// same group and groups come out in date order without needing to re-sort here.
export function groupDetailedSessionsByDate(
  sessions: DetailedSession[],
): DetailedSessionDateGroup[] {
  const groups: DetailedSessionDateGroup[] = []
  let currentGroup: DetailedSessionDateGroup | undefined

  for (const session of sessions) {
    if (!currentGroup || currentGroup.date.getTime() !== session.date.getTime()) {
      currentGroup = { date: session.date, sessions: [] }
      groups.push(currentGroup)
    }
    currentGroup.sessions.push(session)
  }

  return groups
}
