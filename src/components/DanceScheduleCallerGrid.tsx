import type { CSSProperties } from 'react'
import {
  CALLER_COLUMN_WIDTH,
  type DanceCallerSessionPlacement,
  type DanceScheduleCallerLayout,
} from '../lib/computeDanceScheduleCallerLayout'
import { computeEmptyGridCells } from '../lib/computeEmptyGridCells'
import { detailsWithRoomContent } from '../lib/danceScheduleCardContent'
import { formatSessionGca, formatSessionLevels, formatSessionTimeRange } from '../lib/formatDanceSession'
import { isAllHeadlinersSession } from '../lib/recognizedSessionKeywords'
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
  const { session, rowStart, rowSpan, columnStart, columnSpan, lane, laneCount } = placement
  const isFloating = isAllHeadlinersSession(session)
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
  // level grid handles its own (real) overlap case — see assignLanes.ts. An
  // all-headliners session never has laneCount > 1 (it floats rather than claiming
  // a column, so it can't share one with anything — see assignLanesPerSlot).
  if (laneCount > 1) {
    const widthPercent = 100 / laneCount
    style.width = `${widthPercent}%`
    style.marginLeft = `${widthPercent * lane}%`
  }

  const levels = formatSessionLevels(session)
  const gca = formatSessionGca(session)
  const showGcaLine = !isFloating && showGca && !!gca

  // See DanceScheduleLevelGrid.tsx's identical rule — a visible divider between two
  // lane-split cards sharing one column, so they don't read as a single merged card.
  const cardClassName = isFloating ? styles.roomlessCard : `${styles.card}${lane > 0 ? ` ${styles.laneDivider}` : ''}`

  if (isFloating) {
    return (
      <div className={cardClassName} style={style}>
        <div className={styles.roomlessCardContent}>
          {levels && <p className={styles.levels}>{levels}</p>}
          <p className={styles.details}>{detailsWithRoomContent(session)}</p>
          <p className={styles.gca}>{formatSessionTimeRange(session)}</p>
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
// rendering. Every placement here is guaranteed kind === 'structured' (a session
// with no caller at all is skipped entirely by computeDanceScheduleCallerLayout.ts,
// not floated or given a dedicated column) — but a session credited only to a
// collective placeholder ("All Headliners"/"All Callers", see
// isAllHeadlinersSession) DOES get the same roomless-card floating treatment the
// room/level grids give a session that doesn't fit their own axis: it spans every
// visible column, undyed by level color, with the session's own time range shown in
// place of a GCA line (its row/column position already conveys the time visually
// for an ordinary card, but a floating card can span a compressed range of rows
// that doesn't, by itself, make the covered time obvious). An ordinary card's
// caller is already implied by its column, so it shows level(s) plain (first line,
// like the room-columns grid) then event type + bold room (second line) instead of
// a bolded caller name; a floating card keeps that same room-first text since it,
// too, is still accurate — the placeholder name itself is redundant with the card
// already spanning every column.
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
