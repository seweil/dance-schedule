import { assignLanesPerSlot } from './assignLanes'
import { computeDanceScheduleTimeAxis, type TimeMark } from './computeDanceScheduleTimeAxis'
import {
  GCA_CALLER_SHOWCASE_EVENT_TYPE,
  isAllHeadlinersSession,
  isCallerFreeTimeSession,
} from './recognizedSessionKeywords'
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
// caller normally does. Every other real, named caller gets a column regardless of
// how few hours they have scheduled — even a single short slot — per direct
// product decision. (This view previously required a caller's event-wide total to
// exceed 3 hours before they'd get a column at all — see
// computeDanceScheduleHourSummary.ts's own, still-standing MIN_CALLER_HOURS for
// that same concept on the unrelated "Hours by Caller" summary table. Removed here
// after a real report: a caller with just one short session — a 30-minute slot
// split from a longer one — didn't clear the threshold and so didn't appear on
// this page in any form, which was more surprising than a small column would have
// been.)

function isEligibleCallerSession(session: DanceSession): session is StructuredSession {
  return session.kind === 'structured' && session.eventType !== GCA_CALLER_SHOWCASE_EVENT_TYPE
}

// A session belongs on this page at all — either as a real caller's card, or as
// one of the two floating kinds below. Only "GCA Caller Showcase Dance" sessions
// (a structured-only concept) are excluded outright; every freeform session
// (a break, a meal — anything with no caller field) is now eligible too, since it
// always floats as "free" (see structuredFloatKind/buildRawEntries below) rather
// than being skipped.
function isEligibleForCallerPage(session: DanceSession): boolean {
  return session.kind === 'freeform' || isEligibleCallerSession(session)
}

// Which of the two floating categories a STRUCTURED session belongs to, or null
// for an ordinary session with a real, specific caller. 'busy' means every
// headline caller is occupied together (isAllHeadlinersSession — e.g. "All
// Headliners"/"All Callers"); 'free' means no headline caller has anything
// scheduled (isCallerFreeTimeSession — e.g. "GCA Callers", the event's
// non-headline callers running their own session). A freeform session is always
// 'free' too, but that's handled directly in buildRawEntries since it has no
// `callers` field to classify in the first place.
function structuredFloatKind(session: StructuredSession): FloatKind | null {
  if (isAllHeadlinersSession(session)) {
    return 'busy'
  }
  if (isCallerFreeTimeSession(session)) {
    return 'free'
  }
  return null
}

// 'busy': everyone (including headline callers) is occupied together. 'free': no
// headline caller has anything scheduled — either a genuine break (freeform) or a
// structured session naming only non-headline participants. null: an ordinary
// session with a real, specific caller, occupying one caller's own column.
export type FloatKind = 'busy' | 'free' | null

export interface DanceCallerSessionPlacement {
  session: DanceSession
  rowStart: number
  rowSpan: number
  // 0-based index into `visibleCallers`. Always span 1 for an ordinary session — a
  // co-taught session's identical card lands independently in each of its callers'
  // own columns rather than merging into one spanning block, since two arbitrary
  // callers' column order carries no adjacency meaning the way two rooms or two
  // levels can (see docs/design/dance-schedule.md). A floating session (see
  // floatKind) is the one exception: columnStart is always 0 and columnSpan spans
  // every visible caller column, mirroring the room/level views' own
  // roomless-session floating treatment.
  columnStart: number
  columnSpan: number
  // 0-based sub-column index within this placement's column, for the defensive
  // same-caller-double-booked case — see assignLanes.ts. 0 and laneCount 1 for the
  // ordinary, non-overlapping case, which is every real caller column in practice.
  lane: number
  laneCount: number
  // See FloatKind above. Drives both the visual treatment (DanceScheduleCallerGrid.tsx)
  // and columnStart/columnSpan above.
  floatKind: FloatKind
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
// order). A freeform session (no `callers` field at all) contributes nothing — it
// floats (see buildRawEntries) rather than claiming/ordering a column. A floating
// structured session (floatKind !== null — an all-headliners or caller-free-time
// placeholder) contributes nothing here either, for the same reason: its
// placeholder name must never appear in visibleCallers.
function deriveCallerOrder(dateSessions: DanceSession[]): string[] {
  const callers = new Set<string>()
  for (const session of dateSessions) {
    if (!isEligibleCallerSession(session) || structuredFloatKind(session) !== null) {
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
// slotIndex is null for a floating session (floatKind !== null) — mirrors the
// room/level views' own roomless-session convention (see assignLanes.ts's
// LaneEntry): it floats across every visible column instead of claiming one, but
// DOES lane-split against every OTHER floating entry it overlaps in time (e.g. an
// all-evening "Registration" freeform session overlapping a "GCA Callers" session
// within it) — assignLanesPerSlot groups every null-slotIndex entry into one
// shared virtual slot for exactly this.
interface RawEntry {
  session: DanceSession
  rowStart: number
  rowSpan: number
  slotIndex: number | null
  floatKind: FloatKind
  lane: number
  laneCount: number
}

function buildRawEntries(
  eligibleVisible: DanceSession[],
  visibleCallers: string[],
  rowStartFor: (time: Date) => number,
  rowSpanFor: (start: Date, end: Date) => number,
): RawEntry[] {
  const entries: RawEntry[] = []

  for (const session of eligibleVisible) {
    const rowStart = rowStartFor(session.startTime)
    const rowSpan = rowSpanFor(session.startTime, session.endTime)

    if (session.kind === 'freeform') {
      entries.push({ session, rowStart, rowSpan, slotIndex: null, floatKind: 'free', lane: 0, laneCount: 1 })
      continue
    }

    const floatKind = structuredFloatKind(session)
    if (floatKind !== null) {
      entries.push({ session, rowStart, rowSpan, slotIndex: null, floatKind, lane: 0, laneCount: 1 })
      continue
    }

    for (const caller of new Set(session.callers)) {
      const slotIndex = visibleCallers.indexOf(caller)
      if (slotIndex === -1) {
        // Shouldn't happen given this function's documented input contract (every
        // caller in an eligible, visible session is added to visibleCallerSet
        // below, which is exactly what `visibleCallers` is filtered down to) — kept
        // as a defensive guard rather than asserted, since there's no type-level
        // guarantee dateSessions/visibleSessions stay consistent with each other.
        continue
      }
      entries.push({ session, rowStart, rowSpan, slotIndex, floatKind: null, lane: 0, laneCount: 1 })
    }
  }

  return entries
}

// A "free" floating entry (a break, or a caller-free-time placeholder like "GCA
// Callers") claims "no headline caller has anything scheduled" — true only for
// the portion of its own span before anything else starts. Once another entry
// (an ordinary per-caller session, a "busy" floating session, or even another
// "free" one) begins somewhere inside it, that claim stops being accurate for
// the remainder: something else IS scheduled from that point on. Clips a free
// entry's RENDERED rowSpan to end at the earliest other entry's rowStart within
// its own range — only this geometry changes, never the underlying `session`
// object itself.
//
// Mutates `entries` in place, but computes every clip target from each entry's
// ORIGINAL (pre-clip) rowStart/rowSpan first, all at once — order-independent,
// rather than an entry's own clip letting it start un-clipping ITS later
// neighbors as a side effect.
//
// Doesn't attempt to "resume" a free span after a later gap (e.g. if something
// else were scheduled 6:30-7:00 but nothing scheduled 7:00-8:00 within a longer
// break) — simplified rather than fully general, since real data has never
// needed it: see docs/design/dance-schedule.md.
function clipFreeFloatingEntries(entries: RawEntry[]): void {
  const clippedRowSpans = new Map<RawEntry, number>()
  for (const entry of entries) {
    if (entry.floatKind !== 'free') {
      continue
    }
    const rowEnd = entry.rowStart + entry.rowSpan
    let earliestOtherStart: number | undefined
    for (const other of entries) {
      if (other === entry || other.rowStart <= entry.rowStart || other.rowStart >= rowEnd) {
        continue
      }
      if (earliestOtherStart === undefined || other.rowStart < earliestOtherStart) {
        earliestOtherStart = other.rowStart
      }
    }
    if (earliestOtherStart !== undefined) {
      clippedRowSpans.set(entry, earliestOtherStart - entry.rowStart)
    }
  }
  for (const [entry, rowSpan] of clippedRowSpans) {
    entry.rowSpan = rowSpan
  }
}

// A caller's own sessions are naturally sparse across the day, so unlike the room
// or level views (where something is almost always running somewhere), this view
// can have long stretches where nothing is happening for any visible caller.
// computeDanceScheduleTimeAxis.ts already collapses any such gap
// to exactly one row regardless of its real duration ("the axis is not a clock") —
// this goes one step further, specific to this view, and drops that row entirely so
// a real boundary's label sits directly after whatever real content preceded it,
// with no dead row in between at all. A floating entry (a break, or a busy/free
// placeholder session) occupies its own rows just like an ordinary one, so it's
// never compressed away — exactly what makes it show up as a visible time block.
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
 * filter-derived like levels. Every real, named caller gets a column, regardless
 * of how few hours they have scheduled (see isEligibleCallerSession's own comment
 * for why this used to be hour-gated and no longer is). "GCA Caller Showcase Dance"
 * sessions are omitted entirely (see GCA_CALLER_SHOWCASE_EVENT_TYPE) — the one
 * category of session that never appears on this page in any form. There's no
 * contiguous-span-merge concept here (contrast the room/level views' multi-column
 * sessions): two arbitrary callers' column order carries no adjacency meaning, so a
 * co-taught session's identical card is simply placed independently in each of its
 * callers' own columns.
 *
 * Every OTHER session renders as one of three things (see FloatKind):
 * - An ordinary structured session with a real, specific caller gets a placement
 *   in that caller's own column, one per (deduped) caller they list — see
 *   buildRawEntries.
 * - A "busy" floating session (see isAllHeadlinersSession) — credited only to a
 *   collective placeholder like "All Headliners"/"All Callers" — floats across
 *   every visible caller column instead of being skipped, the same slotIndex:
 *   null floating mechanism (assignLanes.ts) already used by the room/level views
 *   for a roomless/unordered session.
 * - A "free" floating session — either a freeform session (a break/meal, no
 *   caller field at all) or a structured session credited only to a recognized
 *   non-headline placeholder (see isCallerFreeTimeSession, e.g. "GCA Callers") —
 *   floats the same way, but styled distinctly (DanceScheduleCallerGrid.tsx) since
 *   it means the opposite thing: headline callers have NOTHING scheduled, rather
 *   than being busy together. This used to be a "session with no caller is
 *   skipped entirely" rule for freeform sessions specifically — reversed after a
 *   real report that a break/meal being completely invisible on this page (no
 *   indication callers had time off) was itself the problem, alongside a
 *   structured "GCA Callers"-style session having the exact same silent-vanishing
 *   bug the original "All Headliners" fix solved for the busy case.
 *
 * `dateSessions` must be every session for the date (unfiltered) — used only to
 * derive a stable caller order, so it never reshuffles as the level filter changes.
 * `visibleSessions` is the level-filtered subset actually rendered — the only input
 * to the time axis itself (after applying isEligibleForCallerPage). Beyond that,
 * this view also drops any row with nothing floating and nothing in ANY visible
 * caller column at all (see
 * compressToOccupiedRows) — a caller's own sessions are sparse enough that, unlike
 * the room/level views, idle stretches between them are common and worth
 * eliminating from the axis entirely, not just capping at one row apiece the way
 * computeDanceScheduleTimeAxis.ts already does for every view.
 *
 * A "free" floating entry's RENDERED span is also clipped to end at the earliest
 * other entry's start within its own range (see clipFreeFloatingEntries) — its
 * "no headline caller has anything scheduled" claim stops being accurate the
 * moment anything else starts, even though its own underlying session keeps
 * running the full length. An all-evening "Registration" session overlapping a
 * real caller session partway through is the motivating real example.
 */
export function computeDanceScheduleCallerLayout(
  dateSessions: DanceSession[],
  visibleSessions: DanceSession[],
): DanceScheduleCallerLayout {
  const eligibleVisible = visibleSessions.filter(isEligibleForCallerPage)

  const timeAxis = computeDanceScheduleTimeAxis(eligibleVisible)
  if (!timeAxis) {
    return EMPTY_CALLER_LAYOUT
  }
  const { rowStartFor, rowSpanFor } = timeAxis

  const callerOrder = deriveCallerOrder(dateSessions)

  // A caller still needs at least one session under the CURRENT date/level filter
  // to show a column at all — an eligible caller (see deriveCallerOrder) with
  // nothing visible right now would otherwise render as an empty column, exactly
  // like a room or level with nothing visible in the other two views.
  const visibleCallerSet = new Set<string>()
  for (const session of eligibleVisible) {
    if (session.kind !== 'structured' || structuredFloatKind(session) !== null) {
      continue
    }
    for (const caller of session.callers) {
      visibleCallerSet.add(caller)
    }
  }

  const visibleCallers = callerOrder.filter((caller) => visibleCallerSet.has(caller))

  const rawEntries = buildRawEntries(eligibleVisible, visibleCallers, rowStartFor, rowSpanFor)
  clipFreeFloatingEntries(rawEntries)
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
    floatKind: entry.floatKind,
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
