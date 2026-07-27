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

// One position on the level slider. Usually exactly one level; two when
// combineA1A2 merges A1 and A2 into a single stop (see getLevelSlots below). A
// session's own `levels` array is unaffected either way — combining only changes
// which slot a level's index resolves to for slider positioning/filtering, not the
// underlying data. See docs/design/dance-schedule.md's LevelSlot decision.
export interface LevelSlot {
  label: string
  levels: readonly OrderedLevelCode[]
}

// The slider's positions, in order, depending on the combineA1A2 feature flag
// (content/<set>/config.yaml, threaded down via virtual:content-config). When
// combined, A1's and A2's two separate slots become one "A1/A2" slot in their
// place — a session tagged only A1, only A2, or both all resolve to that same slot
// index, a real merge for filtering purposes, not just a display relabel.
export function getLevelSlots(combineA1A2: boolean): readonly LevelSlot[] {
  if (!combineA1A2) {
    return LEVEL_ORDER.map((level) => ({ label: level, levels: [level] }))
  }
  return [
    { label: 'SSD', levels: ['SSD'] },
    { label: 'MS', levels: ['MS'] },
    { label: 'Plus', levels: ['Plus'] },
    { label: 'A1/A2', levels: ['A1', 'A2'] },
    { label: 'C1', levels: ['C1'] },
    { label: 'C2', levels: ['C2'] },
    { label: 'C3A', levels: ['C3A'] },
    { label: 'C3B', levels: ['C3B'] },
    { label: 'C4', levels: ['C4'] },
  ]
}

// True if `session` should be visible under the given [minIndex, maxIndex] slider
// range (indices into `slots`, from getLevelSlots). A session with no ordered
// levels at all — a freeform session, or a structured one whose only levels are
// Advanced/Intro/Various — is always visible, since those aren't points on this
// linear scale. A multi-level session (e.g. "C1, C2") is visible if ANY of its
// levels falls in range, not all.
export function isSessionInLevelRange(
  session: DanceSession,
  minIndex: number,
  maxIndex: number,
  slots: readonly LevelSlot[],
): boolean {
  if (session.kind !== 'structured') {
    return true
  }

  const orderedLevels = session.levels.filter(isOrderedLevel)
  if (orderedLevels.length === 0) {
    return true
  }

  return orderedLevels.some((level) => {
    const index = slots.findIndex((slot) => slot.levels.includes(level))
    return index !== -1 && index >= minIndex && index <= maxIndex
  })
}
