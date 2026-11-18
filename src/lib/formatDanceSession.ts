import { formatLevel } from './levelCodes'
import { DEFAULT_EVENT_TYPE } from './recognizedSessionKeywords'
import type { DanceSession } from '../types/danceSchedule'

// Session date/time values are wall-clock values from the spreadsheet, not real
// instants (see buildDanceSchedule.ts) — pinned to UTC so they display exactly as
// entered, same reasoning as ScheduleList.tsx. Shared across every dance-schedule
// rendering surface (the debug table, the generated markdown dump, and the real
// display page) so formatting doesn't get duplicated a third time.
const timeFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' })

export function formatSessionTimeRange(session: DanceSession): string {
  return `${timeFormatter.format(session.startTime)} – ${timeFormatter.format(session.endTime)}`
}

// Round-dance phases print as one "Ph" range when contiguous ("Ph 3-5"), which is
// how every real schedule writes them.
function formatPhases(phases: number[]): string {
  if (phases.length === 0) {
    return ''
  }
  const first = phases[0]!
  const last = phases[phases.length - 1]!
  const isContiguous = last - first === phases.length - 1
  if (!isContiguous) {
    return `Ph ${phases.join(', ')}`
  }
  return first === last ? `Ph ${first}` : `Ph ${first}-${last}`
}

export function formatSessionLevels(session: DanceSession): string {
  if (session.kind !== 'structured') {
    return ''
  }
  if (session.danceForm === 'round') {
    return ['Rounds', formatPhases(session.phases ?? [])].filter(Boolean).join(' ')
  }
  if (session.danceForm === 'clogging') {
    return 'Clogging'
  }
  return session.levels.map(formatLevel).join(', ')
}

// The event type + caller(s), or the freeform description — without any "(freeform)"
// marker, since each consumer styles that differently (e.g. markdown italics vs. plain
// text).
export function formatSessionCallerDetails(session: DanceSession): string {
  if (session.kind === 'freeform') {
    return session.description
  }
  // A round-dance session has a cuer but no caller — "Teach (cuer: ...)", not
  // "Teach -  (cuer: ...)".
  const leaders =
    session.callers.length > 0 || !session.cuers?.length
      ? `${session.eventType} - ${session.callers.join(' & ')}`
      : session.eventType
  return session.cuers?.length ? `${leaders} (cuer: ${session.cuers.join(' & ')})` : leaders
}

// Used by the real display page's session cards (DanceScheduleGrid.tsx), not the
// raw debug table/markdown dump — those stay a faithful, unfiltered echo of the
// parsed data via formatSessionCallerDetails above. "Dancing" is suppressed
// specifically because it's the overwhelmingly common event type in the real data
// (stating it on nearly every card is redundant noise); other types (e.g. "Skirt
// Work Hour", "Leather Tip") are meaningful and kept. Includes the trailing " - "
// separator so a caller can concatenate this directly before the caller name(s);
// empty string (freeform, or eventType "Dancing") when there's nothing to show.
export function formatSessionEventTypePrefix(session: DanceSession): string {
  if (session.kind !== 'structured' || session.eventType === DEFAULT_EVENT_TYPE) {
    return ''
  }
  return `${session.eventType} - `
}

// The session's bold, primary name(s) on a card: its callers, or — for a session
// led by cuers alone (round dancing) — its cuers.
export function formatSessionCallers(session: DanceSession): string {
  if (session.kind !== 'structured') {
    return ''
  }
  const leaders = session.callers.length > 0 ? session.callers : (session.cuers ?? [])
  return leaders.join(' & ')
}

// A card's secondary "Cuer:" line, like its GCA line — only when the session also
// has callers; otherwise the cuers are already its primary names (see
// formatSessionCallers). See docs/design/midwinter-festival-2027.md's "A
// session's cuer shares its card, like GCA".
export function formatSessionCuers(session: DanceSession): string {
  if (session.kind !== 'structured' || session.callers.length === 0) {
    return ''
  }
  return (session.cuers ?? []).join(' & ')
}

export function formatSessionGca(session: DanceSession): string {
  return session.kind === 'structured' ? (session.gca ?? '') : ''
}

export function formatSessionRoom(session: DanceSession): string {
  return session.location.kind === 'roomless' ? '—' : session.location.rooms.join(', ')
}
