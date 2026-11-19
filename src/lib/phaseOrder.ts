import type { DanceSession } from '../types/danceSchedule'

// The round-dance phase scale, for the second, phase slider — its own scale, not
// more rungs on LEVEL_ORDER (see docs/design/midwinter-festival-2027.md's
// "Round-dance phases get their own second slider"). Index i is phase i + 1.
export const PHASES = [1, 2, 3, 4, 5, 6] as const

export const PHASE_LABELS: readonly string[] = PHASES.map((phase) => `Ph ${phase}`)

function phasesOf(session: DanceSession): readonly number[] {
  return session.kind === 'structured' ? (session.phases ?? []) : []
}

// Whether the event has any round dancing with a stated phase — the phase slider
// is omitted entirely otherwise (every event before MidWinter2027).
export function usesPhases(sessions: readonly DanceSession[]): boolean {
  return sessions.some((session) => phasesOf(session).length > 0)
}

// The phase slider's counterpart of isSessionInLevelRange (levelOrder.ts): a session
// with no stated phase — every square-dance session, and a round session like
// "Review Teaches" — is always visible to it, so each slider only ever filters its
// own kind of session. A multi-phase session ("Ph 3-5") is visible if ANY of its
// phases is in range.
export function isSessionInPhaseRange(session: DanceSession, minIndex: number, maxIndex: number): boolean {
  const phases = phasesOf(session)
  return phases.length === 0 || phases.some((phase) => phase - 1 >= minIndex && phase - 1 <= maxIndex)
}

// The phase slider's counterpart of getPresentLevelIndexRange (levelOrder.ts) — trims
// its ends to the phases actually scheduled in `sessions`, falling back to the full
// scale when none are.
export function getPresentPhaseIndexRange(sessions: readonly DanceSession[]): { minIndex: number; maxIndex: number } {
  const indices = sessions.flatMap((session) => phasesOf(session).map((phase) => phase - 1))
  return indices.length === 0
    ? { minIndex: 0, maxIndex: PHASES.length - 1 }
    : { minIndex: Math.min(...indices), maxIndex: Math.max(...indices) }
}
