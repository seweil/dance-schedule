import type { DanceSession, LevelCode } from '../types/danceSchedule'

// The real square-dance skill progression — distinct from LEVEL_CODES's declared
// order (src/types/danceSchedule.ts), which lists Advanced/Intro/Various alongside the
// linear levels even though they aren't points on this scale. Used to drive the
// dance-schedule page's min/max level slider.
export const LEVEL_ORDER = [
  'SSD',
  'MS',
  'Plus',
  'A1',
  'A2',
  'C1',
  'C2',
  'C3A',
  'C3B',
  'C4',
] as const satisfies readonly LevelCode[]

export type OrderedLevelCode = (typeof LEVEL_ORDER)[number]

export function isOrderedLevel(level: LevelCode): level is OrderedLevelCode {
  return (LEVEL_ORDER as readonly string[]).includes(level)
}

// True if `session` should be visible under the given [minIndex, maxIndex] slider
// range (indices into LEVEL_ORDER). A session with no ordered levels at all — a
// freeform session, or a structured one whose only levels are Advanced/Intro/Various —
// is always visible, since those aren't points on this linear scale. A multi-level
// session (e.g. "C1, C2") is visible if ANY of its levels falls in range, not all.
export function isSessionInLevelRange(
  session: DanceSession,
  minIndex: number,
  maxIndex: number,
): boolean {
  if (session.kind !== 'structured') {
    return true
  }

  const orderedLevels = session.levels.filter(isOrderedLevel)
  if (orderedLevels.length === 0) {
    return true
  }

  return orderedLevels.some((level) => {
    const index = LEVEL_ORDER.indexOf(level)
    return index >= minIndex && index <= maxIndex
  })
}
