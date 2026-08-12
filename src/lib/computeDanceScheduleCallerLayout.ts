import { assignLanesPerSlot } from './assignLanes'
import { computeDanceScheduleTimeAxis, type TimeMark } from './computeDanceScheduleTimeAxis'
import { sessionHours } from './computeDanceScheduleHourSummary'
import { GCA_CALLER_SHOWCASE_EVENT_TYPE, isAllHeadlinersSession } from './recognizedSessionKeywords'
import type { DanceSession, StructuredSession } from '../types/danceSchedule'

// Independent from ROOM_COLUMN_WIDTH_REM/LEVEL_COLUMN_WIDTH_REM (not shared) since
// all three may need to diverge with real-world tuning — same reasoning as the
// level grid's own comment on its constant. rem, not px, so it scales with the
// text-size preference (useTextSizePreference.ts) — see ROOM_COLUMN_WIDTH_REM's own
// comment in computeDanceScheduleLayout.ts for the full rationale.
export const CALLER_COLUMN_WIDTH_REM = 9.375
export const CALLER_COLUMN_WIDTH = `${CALLER_COLUMN_WIDTH_REM}rem`

// Same growth formula as levelColumnWidthRem — see that function's comment for the
// full rationale. In practice almost every caller column here computes
// maxLaneCount === 1 (a real caller can't double-book themselves), so this only
// ever matters for the rare data-entry-error case assignLanesPerSlot defends
// against.
export function callerColumnWidthRem(maxLaneCount: number): number {
  return CALLER_COLUMN_WIDTH_REM * (1 + 0.5 * (maxLaneCount - 1))
}

// GCA_CALLER_SHOWCASE_EVENT_TYPE sessions credit a caller, but per direct product
// decision this view omits them entirely — they're not representative of what a
// caller normally does, and mixing them in would inflate a caller's own hour total
// (see MIN_CALLER_HOURS below) with a session type this page isn't meant to
// surface at all.

// A caller's column only appears once they have more than this many hours across
// the WHOLE EVENT (every date, not just the one currently selected) — per direct
// product decision, a caller with just a session or two total isn't worth a whole
// column on this page. Same threshold, same event-wide scope, as
// computeDanceScheduleHourSummary.ts's own MIN_CALLER_HOURS (the two aren't
// literally shared since they're independent "direct product decisions" that could
// in principle diverge, but they're deliberately kept at the same value). Computed
// against `allSessions` (every date, unfiltered) rather than the level-filtered
// `structuredVisible` set used everywhere else in this file — a caller's
// ELIGIBILITY for a column at all must stay stable as the level range narrows AND
// as the selected date changes, exactly like room/level column ORDER already does
// in the other two views (see deriveCallerOrder below, and computeDanceScheduleLayout.ts's
// global room order). Only which of their sessions are actually drawn should react
// to the level filter or date selection, not whether they have a column in the
// first place — computing this from the filtered/date-scoped set instead was the
// root cause of a real bug: narrowing the level range could push a caller's
// in-range total below the threshold and hide their whole column, including
// sessions that were themselves within range (see
// computeDanceScheduleCallerLayout.test.ts's regression test for the exact
// scenario). A previous, day-only version of this threshold had a similar problem:
// a caller with several 1-hour sessions spread across different DAYS, each day
// individually under the threshold, would never get a column on any day even
// though their event-wide total cleared it — confirmed against real production
// data. A session split across multiple callers counts an even share toward each,
// same as computeDanceScheduleHourSummary.ts's own MIN_CALLER_HOURS.
const MIN_CALLER_HOURS = 3

function isEligibleCallerSession(session: DanceSession): session is StructuredSession {
  return session.kind === 'structured' && session.eventType !== GCA_CALLER_SHOWCASE_EVENT_TYPE
}

export interface DanceCallerSessionPlacement {
  session: StructuredSession
  rowStart: number
  rowSpan: number
  // 0-based index into `visibleCallers`. Always span 1 for an ordinary session — a
  // co-taught session's identical card lands independently in each of its callers'
  // own columns rather than merging into one spanning block, since two arbitrary
  // callers' column order carries no adjacency meaning the way two rooms or two
  // levels can (see docs/design/dance-schedule.md). An all-headliners session (see
  // isAllHeadlinersSession) is the one exception: columnStart is always 0 and
  // columnSpan spans every visible caller column, mirroring the room/level views'
  // own roomless-session floating treatment.
  columnStart: number
  columnSpan: number
  // 0-based sub-column index within this placement's column, for the defensive
  // same-caller-double-booked case — see assignLanes.ts. 0 and laneCount 1 for the
  // ordinary, non-overlapping case, which is every real caller column in practice.
  lane: number
  laneCount: number
}

export interface DanceScheduleCallerLayout {
  visibleCallers: string[]
  // One rem width per visible caller, parallel to visibleCallers — see
  // callerColumnWidthRem.
  columnWidthsRem: number[]
  totalRows: number
  timeMarks: TimeMark[]
  placements: DanceCallerSessionPlacement[]
}

const EMPTY_CALLER_LAYOUT: DanceScheduleCallerLayout = {
  visibleCallers: [],
  columnWidthsRem: [],
  totalRows: 0,
  timeMarks: [],
  placements: [],
}

// A caller's own given name — the sort key below, per direct product decision
// ("alphabetical by first name," not full name — square-dance callers are commonly
// referred to by first name alone, and sorting by last name would put e.g. "Vic
// Ceder" and "Kris Jensen" in a less recognizable order for that convention).
function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

// Callers, deduped, sorted alphabetically by first name — full name is only a
// tiebreaker, for the rare case of two callers sharing a first name (never
// observed in real or test data, but sorting otherwise-equal entries by their own
// full name keeps the result deterministic rather than depending on Set iteration
// order). A freeform session (no `callers` field at all) contributes nothing —
// this whole view skips a session with no caller entirely, rather than floating
// it or giving it a dedicated column the way the other two views handle a session
// that doesn't fit their own axis (see docs/design/dance-schedule.md). An
// all-headliners session (see isAllHeadlinersSession) also contributes nothing
// here — it floats across every column rather than claiming/ordering one of its
// own, so its placeholder name must never appear in visibleCallers.
function deriveCallerOrder(dateSessions: DanceSession[]): string[] {
  const callers = new Set<string>()
  for (const session of dateSessions) {
    if (!isEligibleCallerSession(session) || isAllHeadlinersSession(session)) {
      continue
    }
    for (const caller of session.callers) {
      callers.add(caller)
    }
  }
  return Array.from(callers).sort(
    (a, b) => firstNameOf(a).localeCompare(firstNameOf(b)) || a.localeCompare(b),
  )
}

// One entry per (session, caller) pair — a co-taught session always produces one
// entry per name it lists (deduped via Set — a session listing the same name twice
// has never been observed and isn't prevented by the parser, but assignLanesPerSlot
// below absorbs that gracefully rather than needing an explicit guard beyond this).
// slotIndex is null for an all-headliners session (see isAllHeadlinersSession) —
// mirrors the room/level views' own roomless-session convention (see
// assignLanes.ts's LaneEntry): it floats across every visible column instead of
// claiming one, and never participates in lane-overlap assignment.
interface RawEntry {
  session: StructuredSession
  rowStart: number
  rowSpan: number
  slotIndex: number | null
  lane: number
  laneCount: number
}

function buildRawEntries(
  structuredVisible: StructuredSession[],
  visibleCallers: string[],
  rowStartFor: (time: Date) => number,
  rowSpanFor: (start: Date, end: Date) => number,
): RawEntry[] {
  const entries: RawEntry[] = []

  for (const session of structuredVisible) {
    const rowStart = rowStartFor(session.startTime)
    const rowSpan = rowSpanFor(session.startTime, session.endTime)

    if (isAllHeadlinersSession(session)) {
      entries.push({ session, rowStart, rowSpan, slotIndex: null, lane: 0, laneCount: 1 })
      continue
    }

    for (const caller of new Set(session.callers)) {
      const slotIndex = visibleCallers.indexOf(caller)
      if (slotIndex === -1) {
        // Below MIN_CALLER_HOURS (day-wide), so this caller has no column at all —
        // for a co-taught session this can legitimately drop just one of its two
        // placements, leaving the session visible only under whichever caller(s)
        // do meet the threshold.
        continue
      }
      entries.push({ session, rowStart, rowSpan, slotIndex, lane: 0, laneCount: 1 })
    }
  }

  return entries
}

// A caller's own sessions are naturally sparse across the day, so unlike the room
// or level views (where something is almost always running somewhere), this view
// can have long stretches where nothing is happening for any caller who cleared
// MIN_CALLER_HOURS. computeDanceScheduleTimeAxis.ts already collapses any such gap
// to exactly one row regardless of its real duration ("the axis is not a clock") —
// this goes one step further, specific to this view, and drops that row entirely so
// a real boundary's label sits directly after whatever real content preceded it,
// with no dead row in between at all.
//
// Only a row's OPENING boundary can ever be dropped — the boundary that would
// otherwise mark "here's where a gap begins." The boundary that ends a gap (i.e.
// where the next real content starts) is always kept, since the row that starts
// there is occupied. This is why dropping is safe with no visual collision: a
// dropped boundary simply never gets a <div>, it doesn't share a row with a kept
// one. The very last boundary (the end of the day's final session) is always kept
// regardless, as an explicit invariant — it would never actually get dropped by the
// rule above anyway (the row right before it is always occupied by that final
// session itself), but stating it directly is safer than relying on that being true
// only by construction.
function compressToOccupiedRows(
  rawEntries: RawEntry[],
  timeMarks: TimeMark[],
  totalRows: number,
): { rawEntries: RawEntry[]; timeMarks: TimeMark[]; totalRows: number } {
  if (totalRows === 0) {
    return { rawEntries, timeMarks, totalRows }
  }

  // 1-indexed; occupied[row] for row in 1..totalRows (occupied[0] unused).
  const occupied = new Array<boolean>(totalRows + 1).fill(false)
  for (const entry of rawEntries) {
    for (let row = entry.rowStart; row < entry.rowStart + entry.rowSpan; row++) {
      occupied[row] = true
    }
  }

  // compress[b] is the new, compacted row position for original row-boundary b (in
  // 1..totalRows+1) — defined for EVERY boundary, not just kept ones, since an
  // entry's own rowStart/rowSpan need a position even when the label at that exact
  // boundary happens to be dropped. A boundary immediately following an unoccupied
  // row maps to the SAME position as the boundary before it (the gap contributes
  // zero rows); a boundary following an occupied row advances by exactly 1.
  const compress = new Array<number>(totalRows + 2)
  compress[1] = 1
  for (let row = 1; row <= totalRows; row++) {
    compress[row + 1] = occupied[row] ? compress[row]! + 1 : compress[row]!
  }

  const compressedEntries = rawEntries.map((entry) => ({
    ...entry,
    rowStart: compress[entry.rowStart]!,
    rowSpan: compress[entry.rowStart + entry.rowSpan]! - compress[entry.rowStart]!,
  }))

  const compressedMarks: TimeMark[] = []
  for (const mark of timeMarks) {
    const isTrailing = mark.rowStart === totalRows + 1
    const opensAnOccupiedRow = mark.rowStart <= totalRows && occupied[mark.rowStart]
    if (!isTrailing && !opensAnOccupiedRow) {
      continue
    }
    compressedMarks.push({ ...mark, rowStart: compress[mark.rowStart]! })
  }

  return {
    rawEntries: compressedEntries,
    timeMarks: compressedMarks,
    // compress[totalRows + 1] is the trailing boundary's own new POSITION (1-based,
    // like every other boundary) — the row COUNT is one less than that, the same
    // relationship the original totalRows = tickTimes.length - 1 already has.
    totalRows: compress[totalRows + 1]! - 1,
  }
}

// Each column's width is sized for its own PEAK concurrency across the whole day —
// see levelColumnWidthRem's identical reasoning in computeDanceScheduleLevelLayout.ts.
function computeColumnWidthsRem(entries: RawEntry[], visibleCallerCount: number): number[] {
  const maxLaneCounts = new Array<number>(visibleCallerCount).fill(1)
  for (const entry of entries) {
    if (entry.slotIndex === null) {
      // Floats across every column instead of claiming one — doesn't affect any
      // single column's own peak-concurrency width.
      continue
    }
    maxLaneCounts[entry.slotIndex] = Math.max(maxLaneCounts[entry.slotIndex]!, entry.laneCount)
  }
  return maxLaneCounts.map(callerColumnWidthRem)
}

/**
 * Computes the caller-columns counterpart of computeDanceScheduleLayout/
 * computeDanceScheduleLevelLayout: columns are headline callers
 * (session.callers — never session.gca), derived from the data like rooms, not
 * filter-derived like levels. Unlike either other view, a session with no caller at
 * all (a freeform session, e.g. a lunch break) is skipped entirely — no floating,
 * no dedicated "Other" column, since there's nothing for it to be placed "under."
 * "GCA Caller Showcase Dance" sessions are also omitted entirely (see
 * GCA_CALLER_SHOWCASE_EVENT_TYPE), and a caller only gets a column at all once they
 * have more than MIN_CALLER_HOURS hours across the whole event, computed
 * event-wide (see MIN_CALLER_HOURS's own comment for why). Only
 * kind === 'structured' sessions (guaranteed >= 1 caller) ever produce a
 * placement, one per (deduped) caller they list — see buildRawEntries. There's no
 * contiguous-span-merge concept here (contrast the room/level views' multi-column
 * sessions): two arbitrary callers' column order carries no adjacency meaning, so a
 * co-taught session's identical card is simply placed independently in each of its
 * callers' own columns.
 *
 * One further exception: a session credited only to a collective placeholder like
 * "All Headliners"/"All Callers" (see ALL_HEADLINERS_CALLER_NAMES in
 * recognizedSessionKeywords.ts) rather than any specific, trackable caller floats
 * across every visible caller column instead of
 * being skipped — the same slotIndex: null floating mechanism (assignLanes.ts)
 * already used by the room/level views for a roomless/unordered session. Without
 * this, such a session would otherwise vanish from this page entirely: its
 * placeholder name can never individually clear MIN_CALLER_HOURS the way a real
 * caller's own name does.
 *
 * `dateSessions` must be every session for the date (unfiltered) — used only to
 * derive a stable caller order, so it never reshuffles as the level filter changes.
 * `visibleSessions` is the level-filtered subset actually rendered — the only input
 * to the time axis itself, after dropping any callerless (freeform) sessions from
 * it too, so a skipped session contributes no time-axis row either. `allSessions`
 * must be every session across every date (unfiltered) — used only to compute each
 * caller's event-wide hour total against MIN_CALLER_HOURS, so a caller's column
 * eligibility doesn't depend on which date happens to be selected (see
 * MIN_CALLER_HOURS's own comment for why). Beyond that, this view also drops any
 * row with nothing in ANY visible caller column at all (see compressToOccupiedRows)
 * — a caller's own sessions are sparse enough that, unlike the room/level views,
 * idle stretches between them are common and worth eliminating from the axis
 * entirely, not just capping at one row apiece the way
 * computeDanceScheduleTimeAxis.ts already does for every view.
 */
export function computeDanceScheduleCallerLayout(
  dateSessions: DanceSession[],
  visibleSessions: DanceSession[],
  allSessions: DanceSession[],
): DanceScheduleCallerLayout {
  const structuredVisible = visibleSessions.filter(isEligibleCallerSession)

  const timeAxis = computeDanceScheduleTimeAxis(structuredVisible)
  if (!timeAxis) {
    return EMPTY_CALLER_LAYOUT
  }
  const { rowStartFor, rowSpanFor } = timeAxis

  const callerOrder = deriveCallerOrder(dateSessions)

  // A caller's event-wide hour total, split evenly across co-callers on a shared
  // session (same convention as computeDanceScheduleHourSummary.ts) — deliberately
  // computed from `allSessions`, not `dateSessions`/`structuredVisible`, so it
  // stays stable as the level filter narrows AND as the selected date changes (see
  // MIN_CALLER_HOURS's own comment for why).
  const hourTotals = new Map<string, number>()
  for (const session of allSessions) {
    if (!isEligibleCallerSession(session)) {
      continue
    }
    const callers = new Set(session.callers)
    const share = sessionHours(session) / callers.size
    for (const caller of callers) {
      hourTotals.set(caller, (hourTotals.get(caller) ?? 0) + share)
    }
  }

  // A caller still needs at least one session under the CURRENT date/level filter
  // to show a column at all — clearing MIN_CALLER_HOURS event-wide makes them
  // eligible, but an eligible caller with nothing visible right now would just be
  // an empty column, exactly like a room or level with nothing visible in the
  // other two views. This is the reactive half of the two-part check; hourTotals
  // above is the stable half.
  const visibleCallerSet = new Set<string>()
  for (const session of structuredVisible) {
    for (const caller of session.callers) {
      visibleCallerSet.add(caller)
    }
  }

  const visibleCallers = callerOrder.filter(
    (caller) => (hourTotals.get(caller) ?? 0) > MIN_CALLER_HOURS && visibleCallerSet.has(caller),
  )

  const rawEntries = buildRawEntries(structuredVisible, visibleCallers, rowStartFor, rowSpanFor)
  assignLanesPerSlot(rawEntries)

  const compressed = compressToOccupiedRows(rawEntries, timeAxis.timeMarks, timeAxis.totalRows)
  const columnWidthsRem = computeColumnWidthsRem(compressed.rawEntries, visibleCallers.length)

  const placements: DanceCallerSessionPlacement[] = compressed.rawEntries.map((entry) => ({
    session: entry.session,
    rowStart: entry.rowStart,
    rowSpan: entry.rowSpan,
    columnStart: entry.slotIndex ?? 0,
    columnSpan: entry.slotIndex === null ? Math.max(visibleCallers.length, 1) : 1,
    lane: entry.lane,
    laneCount: entry.laneCount,
  }))

  placements.sort((a, b) => a.rowStart - b.rowStart || a.columnStart - b.columnStart)

  return {
    visibleCallers,
    columnWidthsRem,
    totalRows: compressed.totalRows,
    timeMarks: compressed.timeMarks,
    placements,
  }
}
