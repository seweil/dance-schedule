import { LEVEL_ORDER, isOrderedLevel } from './levelOrder'
import type { DanceSession, LevelCode } from '../types/danceSchedule'

// Approximated from the reference paper schedule's own legend (scratch/Dance
// Schedule.pdf) — SSD/MS share one color, as do A1/A2. Intro and Various aren't in
// that legend at all; see colorForSession's doc comment for how they're resolved.
// "Advanced" isn't a LevelCode at all (see LEVEL_CODES's own comment) — it's
// normalized to A2 at parse time, so it never reaches this lookup.
const LEVEL_COLORS: Record<LevelCode, string> = {
  SSD: '#c8e6c9',
  MS: '#c8e6c9',
  Intro: '#c8e6c9',
  Various: '#c8e6c9',
  Plus: '#bbdefb',
  A1: '#d1c4e9',
  A2: '#d1c4e9',
  C1: '#fff9c4',
  C2: '#f8bbd0',
  C3A: '#ffccbc',
  C3B: '#ffab91',
  C4: '#ef9a9a',
}

// Freeform/roomless sessions (e.g. a lunch break) have no level at all.
export const NEUTRAL_CARD_COLOR = '#eeeeee'

function lowestLevel(levels: LevelCode[]): LevelCode {
  const ordered = levels.filter(isOrderedLevel)
  if (ordered.length === 0) {
    return levels[0]!
  }
  return ordered.reduce((lowest, level) =>
    LEVEL_ORDER.indexOf(level) < LEVEL_ORDER.indexOf(lowest) ? level : lowest,
  )
}

/**
 * The background color for a session's card, matching the reference paper
 * schedule's level legend:
 * - A multi-level session (e.g. "C1 & C2") is colored by its LOWEST listed level
 *   (not the first-listed one) — "C1 & C2" gets C1's color.
 * - `Various` is treated as the SSD/MS bucket.
 * - `Intro` is floored to the SSD/MS bucket too — in practice, every real
 *   "Intro to X" session already lists X's actual prerequisite level (e.g.
 *   "A2 : Intro to C1 - ...") rather than the bare `Intro` tag, so the normal
 *   per-level lookup already colors those correctly; the bare `Intro` tag itself
 *   (introducing square dancing with no lower rung to defer to) floors to SSD/MS.
 * - A freeform or roomless session (no level at all) gets a neutral gray.
 */
export function colorForSession(session: DanceSession): string {
  if (session.kind !== 'structured') {
    return NEUTRAL_CARD_COLOR
  }

  return LEVEL_COLORS[lowestLevel(session.levels)]
}
