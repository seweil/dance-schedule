import { DEFAULT_EVENT_TYPE, type DanceSession } from '../types/danceSchedule'

// Session date/time values are wall-clock values from the spreadsheet, not real
// instants (see buildDanceSchedule.ts) — pinned to UTC so they display exactly as
// entered, same reasoning as ScheduleList.tsx. Shared across every dance-schedule
// rendering surface (the debug table, the generated markdown dump, and the real
// display page) so formatting doesn't get duplicated a third time.
const timeFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' })

export function formatSessionTimeRange(session: DanceSession): string {
  return `${timeFormatter.format(session.startTime)} – ${timeFormatter.format(session.endTime)}`
}

export function formatSessionLevels(session: DanceSession): string {
  return session.kind === 'structured' ? session.levels.join(', ') : ''
}

// The event type + caller(s), or the freeform description — without any "(freeform)"
// marker, since each consumer styles that differently (e.g. markdown italics vs. plain
// text).
export function formatSessionCallerDetails(session: DanceSession): string {
  if (session.kind === 'freeform') {
    return session.description
  }
  return `${session.eventType} - ${session.callers.join(' & ')}`
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

export function formatSessionCallers(session: DanceSession): string {
  return session.kind === 'structured' ? session.callers.join(' & ') : ''
}

export function formatSessionGca(session: DanceSession): string {
  return session.kind === 'structured' ? (session.gca ?? '') : ''
}

export function formatSessionRoom(session: DanceSession): string {
  return session.location.kind === 'roomless' ? '—' : session.location.rooms.join(', ')
}
