import type { ReactNode } from 'react'
import { formatSessionCallers, formatSessionEventTypePrefix } from './formatDanceSession'
import type { DanceSession } from '../types/danceSchedule'

// Shared by every dance-schedule grid's session card (room-columns and
// level-columns) — the "details" line (event type + caller(s), or a freeform
// description) is identical regardless of what the card's bold primary label shows.

export function detailsPlainText(session: DanceSession): string {
  return session.kind === 'freeform'
    ? session.description
    : `${formatSessionEventTypePrefix(session)}${formatSessionCallers(session)}`
}

export function detailsContent(session: DanceSession): ReactNode {
  return session.kind === 'freeform' ? (
    session.description
  ) : (
    <>
      {formatSessionEventTypePrefix(session)}
      <strong>{formatSessionCallers(session)}</strong>
    </>
  )
}
