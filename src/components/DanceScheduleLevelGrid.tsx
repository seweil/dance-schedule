import type { CSSProperties } from 'react'
import {
  LEVEL_COLUMN_WIDTH,
  type DanceLevelSessionPlacement,
  type DanceScheduleLevelLayout,
} from '../lib/computeDanceScheduleLevelLayout'
import { computeEmptyGridCells } from '../lib/computeEmptyGridCells'
import { detailsContent } from '../lib/danceScheduleCardContent'
import {
  formatSessionGca,
  formatSessionLevels,
  formatSessionRoom,
  formatSessionTimeRange,
} from '../lib/formatDanceSession'
import { colorForSession } from '../lib/levelColors'
import type { LevelSlot } from '../lib/levelOrder'
import { StickyScrollGrid } from './StickyScrollGrid'
// Reused as-is — the two grids share the exact same visual language (card, levels/
// details/gca lines, sticky headers, mobile scroll behavior); only what determines
// columns and what text is bold differs between them.
import styles from './DanceScheduleGrid.module.css'

const TIME_COLUMN_WIDTH = '70px'

function SessionCard({
  placement,
  showGca,
  slots,
}: {
  placement: DanceLevelSessionPlacement
  showGca: boolean
  slots: readonly LevelSlot[]
}) {
  const { session, rowStart, rowSpan, columnStart, columnSpan, lane, laneCount } = placement
  const isRoomless = session.location.kind === 'roomless'
  const style: CSSProperties = {
    // bodyGrid has no header row of its own to offset past — layout.rowStart is
    // already 1-based for the axis's first row (see computeDanceScheduleTimeAxis.ts
    // and docs/design/dance-schedule-mobile-scroll.md).
    gridRow: `${rowStart} / span ${rowSpan}`,
    gridColumn: `${columnStart + 2} / span ${columnSpan}`,
    // Roomless cards keep their own neutral/centered treatment from the CSS module —
    // only room cards are colored by level.
    backgroundColor: isRoomless ? undefined : colorForSession(session),
  }

  // A laneCount > 1 placement shares its column with other sessions overlapping it
  // in time (different rooms, same level) — shrink and horizontally offset within
  // the column's existing single CSS Grid track rather than needing nested grids or
  // absolute positioning. Plain percentages, not a CSS calc() expression — laneCount
  // is already a known number here, and computing it in JS avoids depending on how
  // (or whether) a browser simplifies/serializes calc(100% / n). Only ever paired
  // with columnSpan === 1: a placement only keeps columnSpan > 1 (a merged multi-
  // level span) when it has no conflict anywhere in its range — see
  // computeDanceScheduleLevelLayout.ts's mergeIntoPlacements.
  if (laneCount > 1) {
    const widthPercent = 100 / laneCount
    style.width = `${widthPercent}%`
    style.marginLeft = `${widthPercent * lane}%`
  }

  const room = formatSessionRoom(session)
  const gca = formatSessionGca(session)
  const showGcaLine = !isRoomless && showGca && !!gca

  // A combined slot (e.g. "A1/A2") doesn't tell you which of its merged levels this
  // particular card actually is — every session landing here collapses to the same
  // single slot index (see computeDanceScheduleLevelLayout.ts's buildRawEntries), so
  // the only place left to recover that is the session's own `levels`. Shown as a
  // plain-text prefix, exactly like a non-"Dancing" event type is. A non-combined
  // slot never needs this — the level is already the column itself.
  const slot = !isRoomless ? slots[columnStart] : undefined
  const levelPrefix = slot && slot.levels.length > 1 ? formatSessionLevels(session) : undefined

  // A visible divider between two lane-split events sharing one column — without
  // it they can read as a single merged card, especially since lane-splitting only
  // ever happens within one level slot, so the two ARE usually the identical
  // level-tinted color (colorForSession above). Only lane > 0 gets it — lane 0's
  // own left edge is the column's natural boundary, not a seam between two events.
  const cardClassName = isRoomless
    ? styles.roomlessCard
    : `${styles.card}${lane > 0 ? ` ${styles.laneDivider}` : ''}`

  return (
    <div className={cardClassName} style={style}>
      <div className={isRoomless ? styles.roomlessCardContent : undefined}>
        <p className={styles.details}>{detailsContent(session, levelPrefix)}</p>
        {room && <p className={styles.details}>{room}</p>}
        {isRoomless && <p className={styles.gca}>{formatSessionTimeRange(session)}</p>}
        {showGcaLine && <p className={styles.gca}>GCA: {gca}</p>}
      </div>
    </div>
  )
}

// See StickyScrollGrid.tsx for the shared two-grid sticky-scroll shell (full
// rationale also in docs/design/dance-schedule-mobile-scroll.md) — this component
// only supplies what a level-columns view needs: columns are level slots
// (layout.visibleSlots, from the level-range filter) instead of rooms, plus its own
// SessionCard rendering. The level is already implied by the column, so each card
// instead shows the details line (event type + bold caller) first, with the room as
// a second, plain (non-bold) line below it — room isn't the primary thing being
// scanned for on this page, caller is.
export function DanceScheduleLevelGrid({
  layout,
  showGca,
  onShowAllLevels,
}: {
  layout: DanceScheduleLevelLayout
  showGca: boolean
  onShowAllLevels: () => void
}) {
  const { visibleSlots, columnWidthsPx, totalRows, timeMarks, placements } = layout

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
  // width can differ — see computeDanceScheduleLevelLayout.ts's columnWidthsPx.
  // Falls back to a single ordinary-width track when there are no visible slots at
  // all, matching the previous Math.max(visibleSlots.length, 1) behavior.
  const columnTracks =
    columnWidthsPx.length > 0
      ? columnWidthsPx.map((width) => `${width}px`).join(' ')
      : LEVEL_COLUMN_WIDTH
  const gridTemplateColumns = `${TIME_COLUMN_WIDTH} ${columnTracks}`
  const emptyCells = computeEmptyGridCells(totalRows, visibleSlots.length, placements)

  return (
    <StickyScrollGrid
      columns={visibleSlots.map((slot) => ({ key: slot.label, title: slot.label, label: slot.label }))}
      gridTemplateColumns={gridTemplateColumns}
      totalRows={totalRows}
      emptyCells={emptyCells}
      timeMarks={timeMarks}
      resetKey={layout}
    >
      {placements.map((placement, index) => (
        // Placements have no stable id of their own (a non-contiguous multi-
        // level or overlapping session produces several for the same session) —
        // index is stable per render.
        <SessionCard key={index} placement={placement} showGca={showGca} slots={visibleSlots} />
      ))}
    </StickyScrollGrid>
  )
}
