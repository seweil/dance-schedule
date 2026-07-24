import type { DanceSession } from '../types/danceSchedule'

export interface DanceSessionDateGroup {
  date: Date
  sessions: DanceSession[]
}

// Groups sessions by calendar date, mirroring groupEventsByDate.ts's pattern.
// Assumes sessions are already chronologically sorted (true of
// buildDanceSchedule's output), so consecutive same-date sessions land in the
// same group and groups come out in date order without needing to re-sort here.
export function groupDanceSessionsByDate(
  sessions: DanceSession[],
): DanceSessionDateGroup[] {
  const groups: DanceSessionDateGroup[] = []
  let currentGroup: DanceSessionDateGroup | undefined

  for (const session of sessions) {
    if (!currentGroup || currentGroup.date.getTime() !== session.date.getTime()) {
      currentGroup = { date: session.date, sessions: [] }
      groups.push(currentGroup)
    }
    currentGroup.sessions.push(session)
  }

  return groups
}
