import { isLevelCode } from './levelCodes'
import type { DanceSessionData } from '../types/danceSchedule'

export interface SourcedDanceSession {
  session: DanceSessionData
  // Where the parser found it, in the input format's own terms — the prefix of any
  // error about this session, e.g.
  // 'Sheet "Thursday July 2", cell C2 (time "12:30p-1:30p", room "Ballroom East")'.
  // Build-time only: loadDanceScheduleData strips it before the data reaches the
  // client.
  source: string
}

interface Booking {
  start: number
  end: number
  source: string
}

// Half-open interval overlap — a session ending exactly when another starts is not
// a conflict (same convention as the rendering layer's lane assignment, see
// assignLanes.ts).
function overlaps(a: Booking, b: Booking): boolean {
  return a.start < b.end && b.start < a.end
}

// Records `booking` under `key`, returning the earliest-recorded booking it
// overlaps, if any. Checked before adding, so a booking never conflicts with itself.
function checkAndRecord(bookings: Map<string, Booking[]>, key: string, booking: Booking): Booking | undefined {
  const existing = bookings.get(key)
  const conflict = existing?.find((other) => overlaps(other, booking))
  if (existing) {
    existing.push(booking)
  } else {
    bookings.set(key, [booking])
  }
  return conflict
}

/**
 * The data-model rules every dance-schedule input format must satisfy, enforced in
 * one place over any parser's output (run by dance-schedule-parsers' loader), so a
 * new format can't silently skip them. Format-specific rules (cell syntax, headers,
 * ...) stay in each parser. Returns errors rather than throwing, so they join the
 * parser's own in one aggregated build error.
 *
 * Sessions are checked in source order: the first booking of a caller/room wins and
 * the conflict is reported on the later one. Times are absolute datetimes, so
 * sessions on different days never conflict, while a session running past midnight
 * is still checked against the next day's early ones.
 */
export function validateDanceSessions(sessions: SourcedDanceSession[]): string[] {
  const errors: string[] = []
  const callerBookings = new Map<string, Booking[]>()
  const roomBookings = new Map<string, Booking[]>()

  for (const { session, source } of sessions) {
    const booking: Booking = {
      start: new Date(session.startTime).getTime(),
      end: new Date(session.endTime).getTime(),
      source,
    }

    if (session.kind === 'structured') {
      // Safety net for a parser that casts rather than checks — a parser should
      // already have rejected the cell itself (see levelCodes.ts).
      for (const level of session.levels) {
        if (!isLevelCode(level)) {
          errors.push(`${source}: unrecognized level code ${JSON.stringify(level)}`)
        }
      }

      // Headline callers only, not `gca` — a GCA credit is a subordinate role, not
      // a second place someone is simultaneously calling from. De-duplicated so a
      // session naming the same co-caller twice doesn't conflict with itself.
      for (const caller of new Set(session.callers)) {
        const conflict = checkAndRecord(callerBookings, caller, booking)
        if (conflict) {
          errors.push(`${source}: caller ${JSON.stringify(caller)} is already booked by ${conflict.source}`)
        }
      }
    }

    if (session.location.kind === 'located') {
      for (const room of new Set(session.location.rooms)) {
        const conflict = checkAndRecord(roomBookings, room, booking)
        if (conflict) {
          errors.push(`${source}: room ${JSON.stringify(room)} is already booked by ${conflict.source}`)
        }
      }
    }
  }

  return errors
}
