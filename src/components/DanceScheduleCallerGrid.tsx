import type { CSSProperties } from 'react'
import {
  CALLER_COLUMN_WIDTH,
  type DanceCallerSessionPlacement,
  type DanceScheduleCallerLayout,
} from '../lib/computeDanceScheduleCallerLayout'
import { computeEmptyGridCells } from '../lib/computeEmptyGridCells'
import { detailsContent, detailsWithRoomContent } from '../lib/danceScheduleCardContent'
import { formatSessionGca, formatSessionLevels } from '../lib/formatDanceSession'
import { colorForSession } from '../lib/levelColors'
import { StickyScrollGrid } from './StickyScrollGrid'
// Reused as-is — every dance-schedule grid shares the exact same visual language
// (card, levels/details/gca lines, sticky headers, mobile scroll behavior); only
// what determines columns and what text is bold differs between them.
import styles from './DanceScheduleGrid.module.css'

// rem, not px — see ROOM_COLUMN_WIDTH_REM's comment (computeDanceScheduleLayout.ts)
// for why. 4.375rem is the same physical width px 70 always was, unscaled.
const TIME_COLUMN_WIDTH = '4.375rem'

function SessionCard({
  placement,
  showGca,
}: {
  placement: DanceCallerSessionPlacement
  showGca: boolean
}) {
  const { session, rowStart, rowSpan, columnStart, columnSpan, lane, laneCount, floatKind } = placement
  const isFloating = floatKind !== null
  const isBusy = floatKind === 'busy'
  const style: CSSProperties = {
    // bodyGrid has no header row of its own to offset past — layout.rowStart is
    // already 1-based for the axis's first row (see computeDanceScheduleTimeAxis.ts
    // and docs/design/dance-schedule-mobile-scroll.md).
    gridRow: `${rowStart} / span ${rowSpan}`,
    gridColumn: `${columnStart + 2} / span ${columnSpan}`,
    backgroundColor: isFloating ? undefined : colorForSession(session),
  }

  // A laneCount > 1 placement shares its column with another entry overlapping it in
  // time — realistically only a data-entry error here (the same caller can't
  // legitimately double-book themselves), but handled the same defensive way the
  // level grid handles its own (real) overlap case — see assignLanes.ts. A
  // floating session never has laneCount > 1 (it floats rather than claiming a
  // column, so it can't share one with anything — see assignLanesPerSlot).
  if (laneCount > 1) {
    const widthPercent = 100 / laneCount
    style.width = `${widthPercent}%`
    style.marginLeft = `${widthPercent * lane}%`
  }

  const levels = formatSessionLevels(session)
  const gca = formatSessionGca(session)
  const showGcaLine = !isFloating && showGca && !!gca

  // See DanceScheduleLevelGrid.tsx's identical rule — a visible divider between two
  // lane-split cards sharing one column (or, for a floating card, sharing the
  // floating "virtual slot" — e.g. an all-evening "Registration" freeform session
  // overlapping a "GCA Callers" session within it, see assignLanes.ts), so they
  // don't read as a single merged card.
  const laneDividerClass = lane > 0 ? ` ${styles.laneDivider}` : ''
  const cardClassName = isFloating
    ? `${styles.roomlessCard}${isBusy ? ` ${styles.busyFloatingCard}` : ''}${laneDividerClass}`
    : `${styles.card}${laneDividerClass}`

  if (isFloating) {
    // A "busy" card (everyone, including headliners, occupied together) keeps
    // bolding the room — caller is implied by "spans every column," same as
    // before. A "free" card bolds the CALLER instead (or shows the freeform
    // description directly) — it does NOT mean "everyone," so the room alone
    // wouldn't explain why headline callers have nothing scheduled here (e.g. "GCA
    // Callers" running their own session while headliners rest). No time-range
    // line, per direct product decision specific to this view — a floating
    // card's own row height already corresponds exactly to the sticky time
    // labels to its left (every row boundary it spans is a real, labeled tick;
    // clipFreeFloatingEntries also keeps a "free" card's own rendered span from
    // ever implying an unlabeled boundary), so restating the time in the card
    // itself would be redundant. This is caller-view-specific, not applied to
    // the room/level views' own roomless cards (DanceScheduleGrid.tsx /
    // DanceScheduleLevelGrid.tsx), which still show it.
    const details = isBusy ? detailsWithRoomContent(session) : detailsContent(session)
    return (
      <div className={cardClassName} style={style}>
        <div className={styles.roomlessCardContent}>
          {levels && <p className={styles.levels}>{levels}</p>}
          <p className={styles.details}>{details}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cardClassName} style={style}>
      {levels && <p className={styles.levels}>{levels}</p>}
      <p className={styles.details}>{detailsWithRoomContent(session)}</p>
      {showGcaLine && <p className={styles.gca}>GCA: {gca}</p>}
    </div>
  )
}

// See StickyScrollGrid.tsx for the shared two-grid sticky-scroll shell (full
// rationale also in docs/design/dance-schedule-mobile-scroll.md) — this component
// only supplies what a caller-columns view needs: columns are headline callers
// (layout.visibleCallers) instead of rooms or levels, plus its own SessionCard
// rendering. An ORDINARY placement (floatKind: null) is always kind === 'structured'
// with a real, specific caller, occupying that caller's own column — it shows
// level(s) plain (first line, like the room-columns grid) then event type + bold
// room (second line) instead of a bolded caller name, since caller is already
// implied by the column.
//
// A FLOATING placement (floatKind !== null — see computeDanceScheduleCallerLayout.ts)
// gets the same roomless-card treatment the room/level grids give a session that
// doesn't fit their own axis: it spans every visible column, undyed by level
// color, no GCA line (no time-range line either, unlike the room/level grids'
// own roomless cards — see SessionCard's own comment for why not needed here).
// The two floating kinds are styled AND worded
// differently, since they mean opposite things: 'busy' (an all-headliners/
// all-callers session — everyone occupied together) keeps the room-first text,
// same reasoning as an ordinary card's caller-is-implied-by-column; 'free' (a
// break/meal, or a structured session naming only non-headline participants —
// headline callers have nothing scheduled) bolds the caller/description instead,
// since "who's actually doing this, if anyone" is the whole point rather than
// being redundant, plus a distinct background color (.busyFloatingCard, applied
// only for 'busy') so the two read as different things at a glance.
export function DanceScheduleCallerGrid({
  layout,
  showGca,
  onShowAllLevels,
}: {
  layout: DanceScheduleCallerLayout
  showGca: boolean
  onShowAllLevels: () => void
}) {
  const { visibleCallers, columnWidthsRem, totalRows, timeMarks, placements } = layout

  if (placements.length === 0) {
    return (
      <p className={styles.empty}>
        No sessions match the current filters. Try widening the level range above, or{' '}
        <button type="button" className={styles.emptyLink} onClick={onShowAllLevels}>
          Show all levels
        </button>
        .
      </p>
    )
  }

  // One explicit track per column (not a uniform repeat()) since each column's
  // width can differ — see computeDanceScheduleCallerLayout.ts's columnWidthsRem.
  const columnTracks =
    columnWidthsRem.length > 0
      ? columnWidthsRem.map((width) => `${width}rem`).join(' ')
      : CALLER_COLUMN_WIDTH
  const gridTemplateColumns = `${TIME_COLUMN_WIDTH} ${columnTracks}`
  const emptyCells = computeEmptyGridCells(totalRows, visibleCallers.length, placements)

  return (
    <StickyScrollGrid
      columns={visibleCallers.map((caller) => ({ key: caller, title: caller, label: caller }))}
      gridTemplateColumns={gridTemplateColumns}
      totalRows={totalRows}
      emptyCells={emptyCells}
      timeMarks={timeMarks}
      resetKey={layout}
    >
      {placements.map((placement, index) => (
        // Placements have no stable id of their own (a co-taught session
        // produces one per caller) — index is stable per render.
        <SessionCard key={index} placement={placement} showGca={showGca} />
      ))}
    </StickyScrollGrid>
  )
}
