import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import {
  CALLER_COLUMN_WIDTH,
  type DanceCallerSessionPlacement,
  type DanceScheduleCallerLayout,
} from '../lib/computeDanceScheduleCallerLayout'
import { computeEmptyGridCells } from '../lib/computeEmptyGridCells'
import { detailsWithRoomContent } from '../lib/danceScheduleCardContent'
import { formatSessionGca, formatSessionLevels } from '../lib/formatDanceSession'
import { colorForSession } from '../lib/levelColors'
// Reused as-is — every dance-schedule grid shares the exact same visual language
// (card, levels/details/gca lines, sticky headers, mobile scroll behavior); only
// what determines columns and what text is bold differs between them.
import styles from './DanceScheduleGrid.module.css'

const TIME_COLUMN_WIDTH = '70px'

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

// The caller-columns counterpart of DanceScheduleGrid/DanceScheduleLevelGrid — same
// two-grid sticky-scroll structure (see DanceScheduleGrid.tsx and
// docs/design/dance-schedule-mobile-scroll.md for the full rationale, unchanged
// here), but columns are headline callers (layout.visibleCallers) instead of rooms
// or levels. Unlike either other grid, every placement here is guaranteed
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
  const { visibleCallers, columnWidthsPx, totalRows, timeMarks, placements } = layout

  const headerRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const handleBodyScroll = useCallback((event: Event) => {
    const header = headerRef.current
    const body = event.currentTarget as HTMLDivElement
    if (header) {
      header.scrollLeft = body.scrollLeft
    }
  }, [])

  // A callback ref, not a useEffect — the component can early-return past this point
  // (the empty-filter-results branch below), unmounting these wrappers entirely; a
  // callback ref correctly re-attaches the listener each time they remount, where a
  // mount-only effect reading .current would miss that transition.
  const setBodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      bodyRef.current?.removeEventListener('scroll', handleBodyScroll)
      bodyRef.current = node
      node?.addEventListener('scroll', handleBodyScroll, { passive: true })
    },
    [handleBodyScroll],
  )

  // A stale horizontal offset from a previous date/filter selection isn't meaningful
  // against a new set of columns — reset whenever the visible callers actually
  // change. `layout` is a fresh reference exactly when the date or level range
  // changes (not on a showGca toggle) — see useDanceScheduleFilters.ts.
  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = 0
    }
    if (bodyRef.current) {
      bodyRef.current.scrollLeft = 0
    }
  }, [layout])

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
  // width can differ — see computeDanceScheduleCallerLayout.ts's columnWidthsPx.
  const columnTracks =
    columnWidthsPx.length > 0
      ? columnWidthsPx.map((width) => `${width}px`).join(' ')
      : CALLER_COLUMN_WIDTH
  const gridTemplateColumns = `${TIME_COLUMN_WIDTH} ${columnTracks}`
  const emptyCells = computeEmptyGridCells(totalRows, visibleCallers.length, placements)

  return (
    <div className={styles.panelWrapper}>
      <div className={styles.headerWrapper} ref={headerRef}>
        <div className={styles.grid} style={{ gridTemplateColumns }}>
          <div className={styles.corner} style={{ gridRow: 1, gridColumn: 1 }} />
          {visibleCallers.map((caller, index) => (
            <div
              key={caller}
              className={styles.roomHeader}
              style={{ gridRow: 1, gridColumn: index + 2 }}
              title={caller}
            >
              {caller}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bodyWrapper} ref={setBodyRef}>
        <div
          className={styles.grid}
          style={{
            gridTemplateColumns,
            // See DanceScheduleGrid.tsx's identical rule for the full rationale —
            // intrinsic sizing with a floor, growth ceiling lives on the card text
            // (line-clamp in DanceScheduleGrid.module.css), not the track.
            gridTemplateRows: `repeat(${totalRows}, minmax(28px, auto))`,
          }}
        >
          {/* Subtle background gridlines — one per genuinely empty cell, never a
              cell a placement covers or one bordering an occupied neighbor (see
              computeEmptyGridCells.ts and .emptyCellTop/.emptyCellLeft's shared
              comment in the CSS module). */}
          {emptyCells.map((cell) => (
            <div
              key={`empty-${cell.row}-${cell.column}`}
              className={`${cell.showTop ? styles.emptyCellTop : ''} ${cell.showLeft ? styles.emptyCellLeft : ''}`.trim()}
              style={{ gridRow: cell.row, gridColumn: cell.column + 2 }}
            />
          ))}
          {timeMarks.map((mark) => (
            <div
              key={mark.rowStart}
              className={styles.timeLabel}
              style={{ gridRow: mark.rowStart, gridColumn: 1 }}
            >
              {mark.label}
            </div>
          ))}
          {placements.map((placement, index) => (
            // Placements have no stable id of their own (a co-taught session
            // produces one per caller) — index is stable per render.
            <SessionCard key={index} placement={placement} showGca={showGca} />
          ))}
        </div>
      </div>
    </div>
  )
}
