import { isOrderedLevel, LEVEL_ORDER } from './levelOrder'
import type { DanceSession } from '../types/danceSchedule'

// The shape of content/<set>/config.yaml's `danceSchedule.roomOrder` (see
// src/types/contentConfig.ts) once it's reached this layer — `undefined` (the
// common case: key omitted) means "use the new median-level default";
// `'spreadsheet'` opts back into the old first-appearance behavior; an explicit
// array names every room across the whole event, in the desired order (see
// validateRoomOrderConfig below for the completeness check that guarantees this).
export type RoomOrderConfig = 'spreadsheet' | readonly string[] | undefined

// Rooms in the order they first appear across `allSessions` (every date, already
// chronologically sorted, per buildDanceSchedule's contract) — because of how the
// parser builds a session's `rooms` list (default single-room, or left-to-right
// ditto chaining), this reconstructs the source spreadsheet's header-column order
// without it being stored anywhere explicitly. A roomless session contributes no
// rooms. This is deriveRoomOrder's own pre-existing behavior, kept as the
// `'spreadsheet'` opt-out and as the fallback ordering for a room with no
// leveled sessions at all (see defaultRoomOrder below). Computed across the whole
// event, not one date, so it's the same regardless of which date is being
// rendered — a room's "first appearance" is simply the earliest date it's used on.
function spreadsheetRoomOrder(allSessions: DanceSession[]): string[] {
  const rooms: string[] = []
  for (const session of allSessions) {
    if (session.location.kind !== 'located') {
      continue
    }
    for (const room of session.location.rooms) {
      if (!rooms.includes(room)) {
        rooms.push(room)
      }
    }
  }
  return rooms
}

// One LEVEL_ORDER index per (session, room, level) combination, pooled across
// EVERY date — a session with two levels contributes two entries per room it
// occupies; a session spanning two rooms contributes its level(s) to both, since
// it really does run in both rooms at once. Only `kind === 'structured'` sessions
// with at least one ordered level contribute anything — a freeform session, or one
// tagged only Intro/Various, has no numeric level to weigh in with.
function collectRoomLevelIndices(allSessions: DanceSession[]): Map<string, number[]> {
  const byRoom = new Map<string, number[]>()
  for (const session of allSessions) {
    if (session.location.kind !== 'located' || session.kind !== 'structured') {
      continue
    }
    const indices = session.levels.filter(isOrderedLevel).map((level) => LEVEL_ORDER.indexOf(level))
    if (indices.length === 0) {
      continue
    }
    for (const room of session.location.rooms) {
      const list = byRoom.get(room)
      if (list) {
        list.push(...indices)
      } else {
        byRoom.set(room, [...indices])
      }
    }
  }
  return byRoom
}

function median(sortedValues: number[]): number {
  const mid = Math.floor(sortedValues.length / 2)
  return sortedValues.length % 2 === 0
    ? (sortedValues[mid - 1]! + sortedValues[mid]!) / 2
    : sortedValues[mid]!
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

// Groups of rooms that must end up adjacent in the final order: any two rooms that
// ever co-occur in one session's multi-room `rooms` list, on ANY date, are unioned
// (transitively — if A spans with B in one session and B spans with C in another,
// A/B/C all end up one group), via simple union-find. A room that never spans with
// anything is its own singleton group. Per direct product decision — without this,
// the median-level sort below could easily separate two rooms a real multi-room
// session spans (e.g. an "All Callers Dance" across two ballrooms), silently
// turning what used to render as one merged card into two duplicate side-by-side
// ones (computeDanceScheduleLayout's own non-contiguous-span fallback, designed
// for exactly this shape but not meant to be the common case). Each returned
// group's members are already in their relative `spreadsheetOrder` — the same
// left-to-right order the spanning session's own `ROOMS:`/ditto-mark convention
// requires its rooms to already be adjacent in (see docs/adding-a-new-event.md),
// so preserving it, not re-sorting within the group, is what keeps a spanning
// session's own two-plus rooms in the right relative order once flattened back out.
function groupSpanningRooms(allSessions: DanceSession[], spreadsheetOrder: string[]): string[][] {
  const parent = new Map<string, string>(spreadsheetOrder.map((room) => [room, room]))

  function find(room: string): string {
    let root = room
    while (parent.get(root) !== root) {
      root = parent.get(root)!
    }
    parent.set(room, root)
    return root
  }

  function union(a: string, b: string): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) {
      parent.set(rootA, rootB)
    }
  }

  for (const session of allSessions) {
    if (session.location.kind !== 'located' || session.location.rooms.length < 2) {
      continue
    }
    const [first, ...rest] = session.location.rooms
    for (const room of rest) {
      union(first!, room)
    }
  }

  const groups = new Map<string, string[]>()
  for (const room of spreadsheetOrder) {
    const root = find(room)
    const group = groups.get(root)
    if (group) {
      group.push(room)
    } else {
      groups.set(root, [room])
    }
  }
  return Array.from(groups.values())
}

// The new default: rooms in increasing order of their median dance level across
// the WHOLE EVENT, not one date (average as the tiebreaker for a median tie —
// most directly relevant for an even-count room, whose median is itself the
// average of two middle values and so ties more often than an odd-count room's),
// grouping any rooms a real multi-room session spans so they stay adjacent (see
// groupSpanningRooms above) — median/average are computed once per GROUP, pooling
// every member room's own data points, so a group of spanning rooms sorts as one
// unit rather than each member competing individually. A group with no leveled
// sessions across any of its members gets median/average of +Infinity, which
// sorts it after every leveled group; per direct product decision, ties
// (including every no-level group, which all tie at Infinity) fall back to
// spreadsheet order (the group's first member's own position), so those rooms
// still sort among themselves exactly as they did before this default existed.
// Computing this once, globally, rather than once per date, is what guarantees
// the exact same room sequence on every date of the event.
function defaultRoomOrder(spreadsheetOrder: string[], allSessions: DanceSession[]): string[] {
  const byRoom = collectRoomLevelIndices(allSessions)
  const groups = groupSpanningRooms(allSessions, spreadsheetOrder)

  const withStats = groups.map((group) => {
    const indices = group.flatMap((room) => byRoom.get(room) ?? [])
    const spreadsheetIndex = spreadsheetOrder.indexOf(group[0]!)
    if (indices.length === 0) {
      return { group, median: Infinity, average: Infinity, spreadsheetIndex }
    }
    const sorted = [...indices].sort((a, b) => a - b)
    return { group, median: median(sorted), average: average(sorted), spreadsheetIndex }
  })

  withStats.sort(
    (a, b) => a.median - b.median || a.average - b.average || a.spreadsheetIndex - b.spreadsheetIndex,
  )

  return withStats.flatMap((entry) => entry.group)
}

/**
 * The room-columns view's GLOBAL column order — the full room sequence for the
 * whole event, identical on every date, not recomputed per date (per direct
 * product decision: a room's position shouldn't shift around as you switch
 * dates). `allSessions` must be every session across every date (unfiltered) —
 * the whole-event scope is exactly what makes the result date-independent.
 * `roomOrderConfig` is content/<set>/config.yaml's `danceSchedule.roomOrder`
 * (see RoomOrderConfig above):
 *
 * - `undefined` (omitted) — the new default: increasing median dance level, average
 *   as tiebreak, no-level rooms last in spreadsheet order — computed per GROUP of
 *   rooms that ever span one session together, not per individual room, so a real
 *   multi-room session's rooms always stay adjacent (see defaultRoomOrder/
 *   groupSpanningRooms).
 * - `'spreadsheet'` — opts back into the original first-appearance-in-the-source-
 *   spreadsheet order verbatim, with no grouping of its own (spanning rooms are
 *   already adjacent under real spreadsheet-authoring convention, so none is
 *   needed — but an artificial/hand-built session list could still produce a
 *   non-contiguous span here, unlike under the default above).
 * - An explicit array — every room in the whole event, in the desired order (see
 *   validateRoomOrderConfig, which guarantees this array is complete before this
 *   function ever runs) — used verbatim, since it's already a complete,
 *   event-wide order. Also ungrouped: an event organizer's own explicit list can
 *   still split a spanning pair if they interleave a room between them.
 *
 * The caller (computeDanceScheduleLayout) is responsible for filtering this full
 * sequence down to whichever rooms are actually visible on the date being
 * rendered — this function itself has no notion of "today," on purpose.
 */
export function deriveRoomOrder(allSessions: DanceSession[], roomOrderConfig: RoomOrderConfig): string[] {
  const spreadsheetOrder = spreadsheetRoomOrder(allSessions)

  if (roomOrderConfig === 'spreadsheet') {
    return spreadsheetOrder
  }
  if (Array.isArray(roomOrderConfig)) {
    // Already validated (validateRoomOrderConfig) to name every real room exactly
    // once — used verbatim as the full, global sequence.
    return [...roomOrderConfig]
  }
  return defaultRoomOrder(spreadsheetOrder, allSessions)
}

// Build-time-only cross-check (called from vite-plugin-dance-schedule.ts, once per
// build/dev-reload, against every date's sessions at once — not per-date) that an
// explicit `danceSchedule.roomOrder` array names every room in the event exactly
// once. A room-order override is easy to get subtly wrong as an event's rooms
// change across revisions (a room added, renamed, or dropped) — failing loudly
// here, with the offending names spelled out, beats silently mis-ordering or
// dropping a room's column. A no-op when roomOrderConfig isn't an explicit array
// (nothing to validate for `undefined`/`'spreadsheet'`).
export function validateRoomOrderConfig(
  allSessions: DanceSession[],
  roomOrderConfig: RoomOrderConfig,
  configFile: string,
): void {
  if (!Array.isArray(roomOrderConfig)) {
    return
  }

  const realRooms = new Set<string>()
  for (const session of allSessions) {
    if (session.location.kind !== 'located') {
      continue
    }
    for (const room of session.location.rooms) {
      realRooms.add(room)
    }
  }

  const listed = new Set<string>()
  const duplicates: string[] = []
  for (const room of roomOrderConfig) {
    if (listed.has(room)) {
      duplicates.push(room)
    }
    listed.add(room)
  }

  const missing = [...realRooms].filter((room) => !listed.has(room))
  const unknown = roomOrderConfig.filter((room) => !realRooms.has(room))

  if (duplicates.length === 0 && missing.length === 0 && unknown.length === 0) {
    return
  }

  const problems: string[] = []
  if (missing.length > 0) {
    problems.push(`missing room(s): ${missing.join(', ')}`)
  }
  if (unknown.length > 0) {
    problems.push(`unknown room(s) not found in any date: ${unknown.join(', ')}`)
  }
  if (duplicates.length > 0) {
    problems.push(`duplicate room(s): ${duplicates.join(', ')}`)
  }

  throw new Error(
    `${configFile}'s "danceSchedule.roomOrder" must name every room in the event exactly once — ${problems.join('; ')}`,
  )
}
