import { isSessionInLevelRange } from './levelOrder'
import type { DanceSession } from '../types/danceSchedule'

// Returns the sessions to show for a given date and level-slider range — combines the
// two independent filters the dance-schedule page applies (date selection, min/max
// skill level) into one pure function so both the layout computation and any other
// consumer see the exact same "visible" set.
export function filterDanceSessions(
  sessions: DanceSession[],
  date: Date,
  minLevelIndex: number,
  maxLevelIndex: number,
): DanceSession[] {
  return sessions.filter(
    (session) =>
      session.date.getTime() === date.getTime() &&
      isSessionInLevelRange(session, minLevelIndex, maxLevelIndex),
  )
}
