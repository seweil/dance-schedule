import { LEVEL_ORDER, isOrderedLevel } from './levelOrder'
import type { DanceForm, DanceSession, LevelCode } from '../types/danceSchedule'

// Approximated from the reference paper schedule's own legend (scratch/Dance
// Schedule.pdf) — SSD/MS share one color, as do A1/A2. Intro and Various aren't in
// that legend at all; see colorForSession's doc comment for how they're resolved.
// "Advanced" isn't a LevelCode at all (see LEVEL_CODES's own comment) — it's
// normalized to A2 at parse time, so it never reaches this lookup.
const LEVEL_COLORS: Record<LevelCode, string> = {
  SSD: '#c8e6c9',
  MS: '#c8e6c9',
  // A shade darker than MS, so the two programs stay tellable apart at an event
  // that has both.
  MSX: '#a5d6a7',
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

// Round dancing and clogging have no square-dance level, so each gets one color of
// its own, distinct from every level's — round dancing isn't split by phase, which
// the card's "Rounds Ph 3-5" line already states.
const DANCE_FORM_COLORS: Record<DanceForm, string> = {
  round: '#b2ebf2',
  clogging: '#ffe0b2',
}

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
 * - A round-dance or clogging session gets its dance form's own color (see
 *   DANCE_FORM_COLORS).
 * - A freeform or roomless session (no level at all) gets a neutral gray.
 */
export function colorForSession(session: DanceSession): string {
  if (session.kind === 'structured' && session.danceForm) {
    return DANCE_FORM_COLORS[session.danceForm]
  }
  if (session.kind !== 'structured' || session.levels.length === 0) {
    return NEUTRAL_CARD_COLOR
  }

  return LEVEL_COLORS[lowestLevel(session.levels)]
}
