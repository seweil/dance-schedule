import { assignLanesPerSlot } from './assignLanes'
import { computeDanceScheduleTimeAxis, type TimeMark } from './computeDanceScheduleTimeAxis'
import type { DanceSession, StructuredSession } from '../types/danceSchedule'

// Independent from ROOM_COLUMN_WIDTH_PX/LEVEL_COLUMN_WIDTH_PX (not shared) since all
// three may need to diverge with real-world tuning — same reasoning as the level
// grid's own comment on its constant.
export const CALLER_COLUMN_WIDTH_PX = 150
export const CALLER_COLUMN_WIDTH = `${CALLER_COLUMN_WIDTH_PX}px`

// Same growth formula as levelColumnWidthPx — see that function's comment for the
// full rationale. In practice almost every caller column here computes
// maxLaneCount === 1 (a real caller can't double-book themselves), so this only
// ever matters for the rare data-entry-error case assignLanesPerSlot defends
// against.
export function callerColumnWidthPx(maxLaneCount: number): number {
  return CALLER_COLUMN_WIDTH_PX * (1 + 0.5 * (maxLaneCount - 1))
}

// "GCA Caller Showcase Dance" sessions credit a caller, but per direct product
// decision this view omits them entirely — they're not representative of what a
// caller normally does, and mixing them in would inflate a caller's own dance count
// (see MIN_CALLER_DANCES below) with a session type this page isn't meant to
// surface at all.
const GCA_CALLER_SHOWCASE_EVENT_TYPE = 'GCA Caller Showcase Dance'

// A caller's column only appears once they have more than this many dances that
// day — per direct product decision, a caller with just a session or two isn't
// worth a whole column on this page. Counted against the same level-filtered
// `structuredVisible` set used everywhere else in this file, so narrowing the
// level range can drop a caller below the threshold the same way it can hide a
// room or level column in the other two views.
const MIN_CALLER_DANCES = 3

function isEligibleCallerSession(session: DanceSession): session is StructuredSession {
  return session.kind === 'structured' && session.eventType !== GCA_CALLER_SHOWCASE_EVENT_TYPE
}

export interface DanceCallerSessionPlacement {
  session: StructuredSession
  rowStart: number
  rowSpan: number
  // 0-based index into `visibleCallers`. Always span 1 — a co-taught session's
  // identical card lands independently in each of its callers' own columns rather
  // than merging into one spanning block, since two arbitrary callers' column order
  // carries no adjacency meaning the way two rooms or two levels can (see
  // docs/design/dance-schedule.md).
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
  // One actual pixel width per visible caller, parallel to visibleCallers — see
  // callerColumnWidthPx.
  columnWidthsPx: number[]
  totalRows: number
  timeMarks: TimeMark[]
  placements: DanceCallerSessionPlacement[]
}

const EMPTY_CALLER_LAYOUT: DanceScheduleCallerLayout = {
  visibleCallers: [],
  columnWidthsPx: [],
  totalRows: 0,
  timeMarks: [],
  placements: [],
}

// Callers in the order they first appear across `dateSessions` (already
// chronologically sorted, per buildDanceSchedule's contract) — mirrors
// deriveRoomOrder in computeDanceScheduleLayout.ts exactly, just over each
// structured session's caller list instead of its room list. A freeform session (no
// `callers` field at all) contributes nothing — this whole view skips a session
// with no caller entirely, rather than floating it or giving it a dedicated column
// the way the other two views handle a session that doesn't fit their own axis (see
// docs/design/dance-schedule.md).
function deriveCallerOrder(dateSessions: DanceSession[]): string[] {
  const callers: string[] = []
  for (const session of dateSessions) {
    if (!isEligibleCallerSession(session)) {
      continue
    }
    for (const caller of session.callers) {
      if (!callers.includes(caller)) {
        callers.push(caller)
      }
    }
  }
  return callers
}

// One entry per (session, caller) pair — a co-taught session always produces one
// entry per name it lists (deduped via Set — a session listing the same name twice
// has never been observed and isn't prevented by the parser, but assignLanesPerSlot
// below absorbs that gracefully rather than needing an explicit guard beyond this).
interface RawEntry {
  session: StructuredSession
  rowStart: number
  rowSpan: number
  slotIndex: number
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

    for (const caller of new Set(session.callers)) {
      const slotIndex = visibleCallers.indexOf(caller)
      if (slotIndex === -1) {
        // Below MIN_CALLER_DANCES, so this caller has no column at all — for a
        // co-taught session this can legitimately drop just one of its two
        // placements, leaving the session visible only under whichever caller(s)
        // do meet the threshold.
        continue
      }
      entries.push({ session, rowStart, rowSpan, slotIndex, lane: 0, laneCount: 1 })
    }
  }

  return entries
}

// Each column's width is sized for its own PEAK concurrency across the whole day —
// see levelColumnWidthPx's identical reasoning in computeDanceScheduleLevelLayout.ts.
function computeColumnWidthsPx(entries: RawEntry[], visibleCallerCount: number): number[] {
  const maxLaneCounts = new Array<number>(visibleCallerCount).fill(1)
  for (const entry of entries) {
    maxLaneCounts[entry.slotIndex] = Math.max(maxLaneCounts[entry.slotIndex]!, entry.laneCount)
  }
  return maxLaneCounts.map(callerColumnWidthPx)
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
 * have more than MIN_CALLER_DANCES visible dances that day. Only
 * kind === 'structured' sessions (guaranteed >= 1 caller) ever produce a
 * placement, one per (deduped) caller they list — see buildRawEntries. There's no
 * contiguous-span-merge concept here (contrast the room/level views' multi-column
 * sessions): two arbitrary callers' column order carries no adjacency meaning, so a
 * co-taught session's identical card is simply placed independently in each of its
 * callers' own columns.
 *
 * `dateSessions` must be every session for the date (unfiltered) — used only to
 * derive a stable caller order, so it never reshuffles as the level filter changes.
 * `visibleSessions` is the level-filtered subset actually rendered — the only input
 * to the time axis itself, after dropping any callerless (freeform) sessions from
 * it too, so a skipped session contributes no time-axis row either.
 */
export function computeDanceScheduleCallerLayout(
  dateSessions: DanceSession[],
  visibleSessions: DanceSession[],
): DanceScheduleCallerLayout {
  const structuredVisible = visibleSessions.filter(isEligibleCallerSession)

  const timeAxis = computeDanceScheduleTimeAxis(structuredVisible)
  if (!timeAxis) {
    return EMPTY_CALLER_LAYOUT
  }
  const { rowStartFor, rowSpanFor } = timeAxis

  const callerOrder = deriveCallerOrder(dateSessions)

  // A caller's dance count — each session they're listed on counts once per name,
  // same as how a co-taught session produces one placement per caller (see
  // buildRawEntries) — decides both whether their column appears at all
  // (MIN_CALLER_DANCES) and, implicitly via this same set, that they have
  // something visible under the current level filter.
  const danceCounts = new Map<string, number>()
  for (const session of structuredVisible) {
    for (const caller of session.callers) {
      danceCounts.set(caller, (danceCounts.get(caller) ?? 0) + 1)
    }
  }
  const visibleCallers = callerOrder.filter((caller) => (danceCounts.get(caller) ?? 0) > MIN_CALLER_DANCES)

  const rawEntries = buildRawEntries(structuredVisible, visibleCallers, rowStartFor, rowSpanFor)
  assignLanesPerSlot(rawEntries)
  const columnWidthsPx = computeColumnWidthsPx(rawEntries, visibleCallers.length)

  const placements: DanceCallerSessionPlacement[] = rawEntries.map((entry) => ({
    session: entry.session,
    rowStart: entry.rowStart,
    rowSpan: entry.rowSpan,
    columnStart: entry.slotIndex,
    columnSpan: 1,
    lane: entry.lane,
    laneCount: entry.laneCount,
  }))

  placements.sort((a, b) => a.rowStart - b.rowStart || a.columnStart - b.columnStart)

  return {
    visibleCallers,
    columnWidthsPx,
    totalRows: timeAxis.totalRows,
    timeMarks: timeAxis.timeMarks,
    placements,
  }
}
