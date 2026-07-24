// MS and Advanced appear in the convention's printed legend but not in the current
// spreadsheet's actual data — included preemptively since they're part of the same
// taxonomy; trivial to remove if they turn out to be unused.
export const LEVEL_CODES = [
  'SSD',
  'MS',
  'Plus',
  'Advanced',
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

interface SessionBase {
  date: string
  startTime: string
  endTime: string
  location: SessionLocation
}

// A cell that parsed as "Level(s) : Type - Caller(s) [GCA: Name]".
export interface StructuredSessionData extends SessionBase {
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

export interface StructuredSession extends SessionBaseResolved {
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
