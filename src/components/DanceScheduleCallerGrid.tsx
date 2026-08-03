import type { CSSProperties } from 'react'
import {
  CALLER_COLUMN_WIDTH,
  type DanceCallerSessionPlacement,
  type DanceScheduleCallerLayout,
} from '../lib/computeDanceScheduleCallerLayout'
import { computeEmptyGridCells } from '../lib/computeEmptyGridCells'
import { detailsWithRoomContent } from '../lib/danceScheduleCardContent'
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
  const { session, rowStart, rowSpan, columnStart, columnSpan, lane, laneCount } = placement
  const style: CSSProperties = {
    // bodyGrid has no header row of its own to offset past — layout.rowStart is
    // already 1-based for the axis's first row (see computeDanceScheduleTimeAxis.ts
    // and docs/design/dance-schedule-mobile-scroll.md).
    gridRow: `${rowStart} / span ${rowSpan}`,
    gridColumn: `${columnStart + 2} / span ${columnSpan}`,
    backgroundColor: colorForSession(session),
  }

  // A laneCount > 1 placement shares its column with another entry overlapping it in
  // time — realistically only a data-entry error here (the same caller can't
  // legitimately double-book themselves), but handled the same defensive way the
  // level grid handles its own (real) overlap case — see assignLanes.ts.
  if (laneCount > 1) {
    const widthPercent = 100 / laneCount
    style.width = `${widthPercent}%`
    style.marginLeft = `${widthPercent * lane}%`
  }

  const levels = formatSessionLevels(session)
  const gca = formatSessionGca(session)
  const showGcaLine = showGca && !!gca

  // See DanceScheduleLevelGrid.tsx's identical rule — a visible divider between two
  // lane-split cards sharing one column, so they don't read as a single merged card.
  const cardClassName = `${styles.card}${lane > 0 ? ` ${styles.laneDivider}` : ''}`

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
// rendering. Unlike either other grid, every placement here is guaranteed
// kind === 'structured' (a session with no caller is skipped entirely by
// computeDanceScheduleCallerLayout.ts, not floated or given a dedicated column), so
// there's no roomless-card treatment to render at all — every card is an ordinary,
// single-column card. Caller is already implied by the column, so the card shows
// level(s) plain (first line, like the room-columns grid) then event type + bold
// room (second line) instead of a bolded caller name.
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
