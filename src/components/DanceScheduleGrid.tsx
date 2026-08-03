import type { CSSProperties } from 'react'
import {
  ROOM_COLUMN_WIDTH,
  type DanceScheduleLayout,
  type DanceSessionPlacement,
} from '../lib/computeDanceScheduleLayout'
import { computeEmptyGridCells } from '../lib/computeEmptyGridCells'
import { detailsContent } from '../lib/danceScheduleCardContent'
import {
  formatSessionGca,
  formatSessionLevels,
  formatSessionTimeRange,
} from '../lib/formatDanceSession'
import { colorForSession } from '../lib/levelColors'
import { StickyScrollGrid } from './StickyScrollGrid'
import styles from './DanceScheduleGrid.module.css'

const TIME_COLUMN_WIDTH = '70px'

function SessionCard({
  placement,
  showGca,
}: {
  placement: DanceSessionPlacement
  showGca: boolean
}) {
  const { session, rowStart, rowSpan, columnStart, columnSpan } = placement
  const isRoomless = session.location.kind === 'roomless'
  const style: CSSProperties = {
    // bodyGrid has no header row of its own to offset past — layout.rowStart is
    // already 1-based for the axis's first row (see computeDanceScheduleLayout.ts
    // and docs/design/dance-schedule-mobile-scroll.md).
    gridRow: `${rowStart} / span ${rowSpan}`,
    gridColumn: `${columnStart + 2} / span ${columnSpan}`,
    // Roomless cards keep their own neutral/centered treatment from the CSS module —
    // only room cards are colored by level.
    backgroundColor: isRoomless ? undefined : colorForSession(session),
  }
  const levels = formatSessionLevels(session)
  const gca = formatSessionGca(session)
  const showGcaLine = !isRoomless && showGca && !!gca

  return (
    <div className={isRoomless ? styles.roomlessCard : styles.card} style={style}>
      <div className={isRoomless ? styles.roomlessCardContent : undefined}>
        {levels && <p className={styles.levels}>{levels}</p>}
        <p className={styles.details}>{detailsContent(session)}</p>
        {isRoomless && <p className={styles.gca}>{formatSessionTimeRange(session)}</p>}
        {showGcaLine && <p className={styles.gca}>GCA: {gca}</p>}
      </div>
    </div>
  )
}

// See StickyScrollGrid.tsx for the shared two-grid sticky-scroll shell (full
// rationale also in docs/design/dance-schedule-mobile-scroll.md) — this component
// only supplies what a room-columns view needs: the room list as columns, and its
// own SessionCard rendering.
export function DanceScheduleGrid({
  layout,
  showGca,
  onShowAllLevels,
}: {
  layout: DanceScheduleLayout
  showGca: boolean
  onShowAllLevels: () => void
}) {
  const { visibleRooms, totalRows, timeMarks, placements } = layout

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

  const gridTemplateColumns = `${TIME_COLUMN_WIDTH} repeat(${Math.max(visibleRooms.length, 1)}, ${ROOM_COLUMN_WIDTH})`
  const emptyCells = computeEmptyGridCells(totalRows, visibleRooms.length, placements)

  return (
    <StickyScrollGrid
      columns={visibleRooms.map((room) => ({ key: room, title: room, label: room }))}
      gridTemplateColumns={gridTemplateColumns}
      totalRows={totalRows}
      emptyCells={emptyCells}
      timeMarks={timeMarks}
      resetKey={layout}
    >
      {placements.map((placement, index) => (
        // Placements have no stable id of their own (a non-contiguous multi-room
        // session produces several for the same session) — index is stable per render.
        <SessionCard key={index} placement={placement} showGca={showGca} />
      ))}
    </StickyScrollGrid>
  )
}
