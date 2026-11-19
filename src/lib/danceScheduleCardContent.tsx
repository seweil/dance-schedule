import type { ReactNode } from 'react'
import { formatSessionCallers, formatSessionEventTypePrefix, formatSessionRoom } from './formatDanceSession'
import type { DanceSession } from '../types/danceSchedule'

// Shared by every dance-schedule grid's session card (room-columns and
// level-columns) — the "details" line (event type + caller(s), or a freeform
// description) is identical regardless of what the card's bold primary label shows.
//
// `levelPrefix` is only ever passed by the level-columns grid, and only for a
// session sitting in a *combined* slot (e.g. "A1/A2") — the column header alone
// can't tell you whether that particular card is A1, A2, or both, so the plain-text
// level(s) get prepended the same way an event type prefix does (e.g. "A1 - Vic
// Ceder", or "A1, A2 - Advanced Hothash - Justin Russell"). Omitted (undefined)
// whenever the slot isn't combined — the level is already implied by the column
// there, same as it always was.

// Drops the trailing " - " separator when nothing bold follows it — a session that
// names nobody ("Teach Ph 5" before its cuer is known, say) reads "Teach Ph 5", not
// "Teach Ph 5 - ".
function prefix(session: DanceSession, levelPrefix: string | undefined, followedBy: string): string {
  const levelPart = levelPrefix ? `${levelPrefix} - ` : ''
  const text = `${levelPart}${formatSessionEventTypePrefix(session)}`
  return followedBy ? text : text.replace(/ - $/, '')
}

export function detailsPlainText(session: DanceSession, levelPrefix?: string): string {
  if (session.kind === 'freeform') {
    return session.description
  }
  const callers = formatSessionCallers(session)
  return `${prefix(session, levelPrefix, callers)}${callers}`
}

export function detailsContent(session: DanceSession, levelPrefix?: string): ReactNode {
  if (session.kind === 'freeform') {
    return session.description
  }
  const callers = formatSessionCallers(session)
  return (
    <>
      {prefix(session, levelPrefix, callers)}
      {callers && <strong>{callers}</strong>}
    </>
  )
}

// The caller-columns grid's counterpart of detailsContent — caller is already
// implied by the column there, so room (not caller) is the bold primary fact. No
// levelPrefix concept: unlike a combined level slot, a caller column is never
// ambiguous about which session it is.
export function detailsWithRoomContent(session: DanceSession): ReactNode {
  return session.kind === 'freeform' ? (
    session.description
  ) : (
    <>
      {formatSessionEventTypePrefix(session)}
      <strong>{formatSessionRoom(session)}</strong>
    </>
  )
}
