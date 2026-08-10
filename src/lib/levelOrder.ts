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

// One position on the level slider. Usually exactly one level; two when a merge
// (see LevelMerge/getLevelSlots below) combines several adjacent levels into a
// single stop. A session's own `levels` array is unaffected either way — combining
// only changes which slot a level's index resolves to for slider positioning/
// filtering, not the underlying data. See docs/design/dance-schedule.md's LevelSlot
// decision.
export interface LevelSlot {
  label: string
  levels: readonly OrderedLevelCode[]
}

// Collapses one or more *adjacent* LEVEL_ORDER entries into a single labeled slot,
// in their place. buildLevelSlots below derives every merge's members from
// LEVEL_ORDER itself (asserting contiguity) rather than a hand-duplicated slot
// array — the previous single-flag implementation hand-wrote a whole second array
// for the combined case, which docs/known-issues.md flagged as silently
// dropping any future LEVEL_ORDER insertion that a combined-mode branch forgot to
// also update; that failure mode gets worse, not better, once a second
// independent merge exists, so it's fixed here rather than copied.
interface LevelMerge {
  label: string
  levels: readonly [OrderedLevelCode, ...OrderedLevelCode[]]
}

function buildLevelSlots(merges: readonly LevelMerge[]): readonly LevelSlot[] {
  const slots: LevelSlot[] = []
  let i = 0
  while (i < LEVEL_ORDER.length) {
    const merge = merges.find((m) => m.levels[0] === LEVEL_ORDER[i])
    if (merge) {
      const matched = LEVEL_ORDER.slice(i, i + merge.levels.length)
      const isContiguousMatch =
        matched.length === merge.levels.length &&
        matched.every((level, offset) => level === merge.levels[offset])
      if (!isContiguousMatch) {
        throw new Error(
          `Merge "${merge.label}" (${merge.levels.join(', ')}) is not a contiguous run in LEVEL_ORDER`,
        )
      }
      slots.push({ label: merge.label, levels: merge.levels })
      i += merge.levels.length
    } else {
      slots.push({ label: LEVEL_ORDER[i]!, levels: [LEVEL_ORDER[i]!] })
      i += 1
    }
  }
  return slots
}

// The slider's positions, in order, depending on the combineA1A2/combineC3BC4
// feature flags (content/<set>/config.yaml, threaded down via
// virtual:content-config). When combined, a merge's levels resolve to one shared
// slot in their place — a session tagged with any one of them, or several, all
// resolve to that same slot index, a real merge for filtering purposes, not just a
// display relabel. combineC3BC4's merged slot is labeled "C3B+" (not "C3B/C4"),
// matching square-dance convention for "C3B and above."
export function getLevelSlots(combineA1A2: boolean, combineC3BC4: boolean): readonly LevelSlot[] {
  const merges: LevelMerge[] = []
  if (combineA1A2) {
    merges.push({ label: 'A1/A2', levels: ['A1', 'A2'] })
  }
  if (combineC3BC4) {
    merges.push({ label: 'C3B+', levels: ['C3B', 'C4'] })
  }
  return buildLevelSlots(merges)
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

// The [minIndex, maxIndex] sub-range of `slots` actually used by `sessions` — meant
// for a single date's worth of sessions, to trim the level slider's dead ends down to
// what's scheduled that day (e.g. an event whose registration starts at A2 never
// needs SSD/MS/Plus slider stops). Deliberately only trims the ends, not internal
// gaps (a day missing one level in the middle of an otherwise-present range still
// gets every tick in between) — mirrors this codebase's existing "simplified rather
// than fully general" precedent for a similar compound case (see Open Questions in
// docs/design/dance-schedule.md). Falls back to the full range when `sessions` has no
// ordered-level sessions at all (e.g. an all-Various/freeform day), so a slider never
// collapses to nothing. Callers are responsible for date-scoping `sessions` first,
// same division of responsibility as isSessionInLevelRange above.
export function getPresentLevelIndexRange(
  sessions: readonly DanceSession[],
  slots: readonly LevelSlot[],
): { minIndex: number; maxIndex: number } {
  let minIndex: number | undefined
  let maxIndex: number | undefined
  for (const session of sessions) {
    if (session.kind !== 'structured') continue
    for (const level of session.levels) {
      if (!isOrderedLevel(level)) continue
      const index = slots.findIndex((slot) => slot.levels.includes(level))
      if (index === -1) continue
      if (minIndex === undefined || index < minIndex) minIndex = index
      if (maxIndex === undefined || index > maxIndex) maxIndex = index
    }
  }
  return minIndex === undefined || maxIndex === undefined
    ? { minIndex: 0, maxIndex: slots.length - 1 }
    : { minIndex, maxIndex }
}

export function clampLevelIndex(value: number, range: { minIndex: number; maxIndex: number }): number {
  return Math.min(Math.max(value, range.minIndex), range.maxIndex)
}
