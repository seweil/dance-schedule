// MSX is "Mainstream – Extended Application", a distinct program from MS (standard
// application) at events that run both (docs/design/midwinter-festival-2027.md).
// MS appears in the convention's printed legend but not in the current spreadsheet's
// actual data — included preemptively since it's part of the same taxonomy; trivial
// to remove if it turns out to be unused. "Advanced" is NOT one of these codes,
// deliberately — it isn't a real level of its own, just a common informal way
// organizers write A2 (see src/lib/levelCodes.ts's LEVEL_ALIASES, which
// normalizes it to 'A2' before this list is ever consulted — write "A1" explicitly
// if that's what's actually meant).
export const LEVEL_CODES = [
  'SSD',
  'MS',
  'MSX',
  'Plus',
  'C1',
  'C2',
  'C3A',
  'C3B',
  'C4',
  'A1',
  'A2',
  'Intro',
  'Various',
] as const
export type LevelCode = (typeof LEVEL_CODES)[number]

// A session either occupies one or more named rooms (the common case is exactly one),
// or has no room at all (e.g. a lunch break) — see docs/design/dance-schedule.md for
// the "ROOMS:"/ditto-mark authoring conventions that produce each variant.
export type SessionLocation =
  | { kind: 'located'; rooms: string[] }
  | { kind: 'roomless' }

// Which kind of dancing a structured session is. Absent means square dancing, the
// only kind events before MidWinter2027 had — so `levels` is always non-empty for
// those. A round-dance or clogging session has no square-dance levels at all
// (`levels: []`); a round session's level is its `phases` instead. See
// docs/design/midwinter-festival-2027.md.
export type DanceForm = 'round' | 'clogging'

// The fields a session gains at an event with round dancing — shared by the data
// and resolved shapes below.
interface RoundDanceFields {
  // Round dance cuer(s): on a square-dance session, whoever cues the rounds between
  // tips; on a round-dance session, whoever runs it. A separate field from
  // `callers`, like `gca`, so nothing that reads `callers` changes meaning.
  cuers?: string[]
  danceForm?: DanceForm
  // Round-dance phases (1–6) the session covers, ascending — "Ph 3-5" is [3, 4, 5].
  // Only on round sessions; empty for one with no stated phase ("Intro to Rounds").
  phases?: number[]
}

interface SessionBase {
  date: string
  startTime: string
  endTime: string
  location: SessionLocation
}

// A cell that parsed as "Level(s) : Type - Caller(s) [GCA: Name]".
export interface StructuredSessionData extends SessionBase, RoundDanceFields {
  kind: 'structured'
  levels: LevelCode[]
  eventType: string
  callers: string[]
  gca?: string
}

// A cell prefixed with "* " — treated as a literal description, no structured fields.
export interface FreeformSessionData extends SessionBase {
  kind: 'freeform'
  description: string
}

// Shape crossing the virtual:dance-schedule module boundary — dates as ISO
// strings, same reasoning as ScheduleEventData (Date objects can't survive being
// embedded in generated JS source via JSON.stringify).
export type DanceSessionData = StructuredSessionData | FreeformSessionData

interface SessionBaseResolved {
  date: Date
  startTime: Date
  endTime: Date
  location: SessionLocation
}

export interface StructuredSession extends SessionBaseResolved, RoundDanceFields {
  kind: 'structured'
  levels: LevelCode[]
  eventType: string
  callers: string[]
  gca?: string
}

export interface FreeformSession extends SessionBaseResolved {
  kind: 'freeform'
  description: string
}

// App-facing shape (Date objects), produced by buildDanceSchedule().
export type DanceSession = StructuredSession | FreeformSession
