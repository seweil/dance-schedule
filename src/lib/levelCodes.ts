import { LEVEL_CODES, type LevelCode } from '../types/danceSchedule'

// The one definition of what a valid level is — used by every dance-schedule
// parser (to reject a bad level as a syntax error in its own terms) and by the
// shared validator (validateDanceSessions.ts) as an invariant check on every
// parser's output.
export function isLevelCode(value: string): value is LevelCode {
  return (LEVEL_CODES as readonly string[]).includes(value)
}

// "Advanced" isn't a real level of its own (see LEVEL_CODES's own comment) — it's a
// common informal way organizers write A2 in a proposal spreadsheet, since "Advanced"
// dancing without further qualification is assumed to mean the fuller A1+A2 track,
// not A1 alone. A parser normalizes through here before isLevelCode is ever
// consulted, so an author can write either one; write "A1" explicitly (not
// "Advanced") for a session that's specifically A1, not A2.
const LEVEL_ALIASES: Record<string, LevelCode> = {
  Advanced: 'A2',
}

export function normalizeLevelCode(raw: string): string {
  return LEVEL_ALIASES[raw] ?? raw
}

// How a level reads on the page, where it differs from its code — slider ticks,
// column headers, card level lines, the "Only … this day" note. The one place to
// rename a level's display label; tests read it through formatLevel rather than
// repeating the text. MSX (Mainstream Extended) was "MS Ext" until 2026-11-18.
const LEVEL_LABELS: Partial<Record<LevelCode, string>> = {
  MSX: 'MS+',
}

export function formatLevel(level: LevelCode): string {
  return LEVEL_LABELS[level] ?? level
}
