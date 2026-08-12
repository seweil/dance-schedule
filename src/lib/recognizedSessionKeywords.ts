import type { DanceSession, StructuredSession } from '../types/danceSchedule'

// The single home for every exact-literal value the app treats specially in
// already-*parsed* session data — as opposed to raw spreadsheet cell SYNTAX
// (the "Level : Type - Caller" grammar, "GCA:"/"ROOMS:" prefixes, the ditto
// mark, etc.), which stays parser-internal in parseDanceScheduleSheet.ts since
// it's genuinely coupled to the parsing logic that reads it and has exactly one
// consumer. Everything below is instead read by MULTIPLE unrelated downstream
// files — hour-summary computation, caller-column layout, card formatting — and
// used to live scattered across whichever of those files happened to need it
// first. That scattering was never a deliberate design choice: this file's own
// history is three copies of the same "hardcoded recognized-string" pattern,
// each one's own comment citing the previous as precedent instead of sharing
// code with it. If a fourth such value is ever needed (a new recognized event
// type, a new collective-caller placeholder, etc.), it belongs here too, not in
// whichever downstream file happens to need it first.
//
// See docs/adding-a-new-event.md's "Cell format details" and
// docs/design/dance-schedule.md's decision entries for the user-facing and
// full-rationale explanations of each value below, respectively.

// The implied event type when a cell omits "Type - " entirely ("Level : Caller"),
// and the one type formatSessionEventTypePrefix (formatDanceSession.ts) suppresses
// as redundant on real display cards — shared so the parser's default and the
// formatter's no-op check can't drift apart.
export const DEFAULT_EVENT_TYPE = 'Dancing'

// "GCA Caller Showcase Dance" sessions credit a caller like any other structured
// session, but a caller whose ONLY credited hours come from this event type is a
// fundamentally different kind of entry than a real headline caller — see
// DanceScheduleHourSummaryTable's `groupBoundary` (computeDanceScheduleHourSummary.ts)
// and the caller-columns view's own exclusion of it (computeDanceScheduleCallerLayout.ts).
export const GCA_CALLER_SHOWCASE_EVENT_TYPE = 'GCA Caller Showcase Dance'

// Recognized collective-caller placeholders — a session credited to "everyone
// headlining this event" rather than one or more specific, trackable callers.
// Hardcoded rather than inferred from session shape (e.g. "listed as the sole
// caller of a multi-room session") since a real multi-room session can legitimately
// have one specific caller too (see docs/adding-a-new-event.md's own worked
// example), so room count alone isn't a safe signal. Add a name here if a future
// event's spreadsheet uses different placeholder wording.
export const ALL_HEADLINERS_CALLER_NAMES = new Set(['All Headliners', 'All Callers'])

// A session "credited" only to a collective placeholder, not any specific caller —
// see ALL_HEADLINERS_CALLER_NAMES. Deliberately requires EVERY listed caller to be a
// recognized placeholder (not just one of several) — a session co-crediting a real
// caller alongside "All Headliners" has never been observed, and if it ever
// happened, treating it as a normal per-caller session (so the real caller still
// gets their own column placement) is the safer default than floating it.
export function isAllHeadlinersSession(session: StructuredSession): boolean {
  return session.callers.length > 0 && session.callers.every((caller) => ALL_HEADLINERS_CALLER_NAMES.has(caller))
}

// Recognized NON-headline placeholders — the opposite of ALL_HEADLINERS_CALLER_NAMES
// above. A session naming only these callers means every HEADLINE caller is free
// during it (e.g. the event's non-headline/GCA callers running their own session
// while the headliners rest), not that everyone is occupied together. On the
// Caller Schedule page this floats the same way an all-headliners session does, but
// styled to look like a break (see computeDanceScheduleCallerLayout.ts) rather than
// like a busy block. Add a name here if a future event's spreadsheet uses different
// wording for this same "headliners have nothing scheduled" concept.
export const CALLER_FREE_TIME_NAMES = new Set(['GCA Callers'])

// Same shape and rationale as isAllHeadlinersSession — see that function's comment.
export function isCallerFreeTimeSession(session: StructuredSession): boolean {
  return session.callers.length > 0 && session.callers.every((caller) => CALLER_FREE_TIME_NAMES.has(caller))
}

// The one freeform description that keeps its time-range line on the room/level
// views' own roomless cards (DanceScheduleGrid.tsx / DanceScheduleLevelGrid.tsx) —
// every other roomless card there omits it, matching the caller-columns view's own
// floating cards (see docs/design/dance-schedule.md's "No time-range line" decision):
// a roomless card's own row height already lines up with the sticky time-axis labels
// to its left, so restating the time is redundant. Registration is the exception
// because it commonly overlaps real, room-specific dancing happening at the same
// time (see that same doc's MotivateToSeattle example — a 5:30–8:00 PM Registration
// session overlapping both a 6:30–7:00 PM "GCA Callers" session and a 7:00–8:00 PM
// "Trail-In Dance" one), so its own row span doesn't correspond to a clean, dedicated
// stretch of the axis the way an isolated meal break's does — the explicit time-range
// text resolves that ambiguity. Match is exact and case-sensitive, same convention as
// every other recognized value in this file — add a name here if a future event's
// spreadsheet spells this differently.
export const REGISTRATION_DESCRIPTIONS = new Set(['Registration'])

export function isRegistrationSession(session: DanceSession): boolean {
  return session.kind === 'freeform' && REGISTRATION_DESCRIPTIONS.has(session.description)
}
