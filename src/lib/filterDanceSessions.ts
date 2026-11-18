import { isSessionInLevelRange, type LevelSlot } from './levelOrder'
import { PHASES, isSessionInPhaseRange } from './phaseOrder'
import type { DanceSession } from '../types/danceSchedule'

export interface PhaseIndexRange {
  minPhaseIndex: number
  maxPhaseIndex: number
}

const FULL_PHASE_RANGE: PhaseIndexRange = { minPhaseIndex: 0, maxPhaseIndex: PHASES.length - 1 }

// Returns the sessions to show for a given date, level-slider range and phase-slider
// range — combines the independent filters the dance-schedule page applies (date
// selection, min/max skill level, min/max round-dance phase) into one pure function
// so both the layout computation and any other consumer see the exact same
// "visible" set. `slots` (from getLevelSlots) determines what each level-range index
// means, e.g. whether A1/A2 are combined. Each slider passes every session that
// isn't its own kind (see isSessionInPhaseRange), so requiring both is the same as
// "matches either range" for a session that's only one kind — every session so far
// (docs/design/midwinter-festival-2027.md). Omitting `phaseRange` (an event with no
// phase slider) filters by level alone.
export function filterDanceSessions(
  sessions: DanceSession[],
  date: Date,
  minLevelIndex: number,
  maxLevelIndex: number,
  slots: readonly LevelSlot[],
  { minPhaseIndex, maxPhaseIndex }: PhaseIndexRange = FULL_PHASE_RANGE,
): DanceSession[] {
  return sessions.filter(
    (session) =>
      session.date.getTime() === date.getTime() &&
      isSessionInLevelRange(session, minLevelIndex, maxLevelIndex, slots) &&
      isSessionInPhaseRange(session, minPhaseIndex, maxPhaseIndex),
  )
}
