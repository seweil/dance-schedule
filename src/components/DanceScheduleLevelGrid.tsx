import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import {
  LEVEL_COLUMN_WIDTH,
  type DanceLevelSessionPlacement,
  type DanceScheduleLevelLayout,
} from '../lib/computeDanceScheduleLevelLayout'
import { computeEmptyGridCells } from '../lib/computeEmptyGridCells'
import { detailsContent } from '../lib/danceScheduleCardContent'
import { formatSessionGca, formatSessionLevels, formatSessionRoom, formatSessionTimeRange } from '../lib/formatDanceSession'
import { colorForSession } from '../lib/levelColors'
import type { LevelSlot } from '../lib/levelOrder'
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

  return (
    <div className={isRoomless ? styles.roomlessCard : styles.card} style={style}>
      <div>
        <p className={styles.details}>{detailsContent(session, levelPrefix)}</p>
        {room && <p className={styles.details}>{room}</p>}
        {isRoomless && <p className={styles.gca}>{formatSessionTimeRange(session)}</p>}
        {showGcaLine && <p className={styles.gca}>GCA: {gca}</p>}
      </div>
    </div>
  )
}

// The level-columns counterpart of DanceScheduleGrid — same two-grid sticky-scroll
// structure (see that component and docs/design/dance-schedule-mobile-scroll.md for
// the full rationale, unchanged here), but columns are level slots
// (layout.visibleSlots, from the level-range filter) instead of rooms. The level is
// already implied by the column, so each card instead shows the details line (event
// type + bold caller) first, with the room as a second, plain (non-bold) line below
// it — room isn't the primary thing being scanned for on this page, caller is.
export function DanceScheduleLevelGrid({
  layout,
  showGca,
}: {
  layout: DanceScheduleLevelLayout
  showGca: boolean
}) {
  const { visibleSlots, columnWidthsPx, totalRows, timeMarks, placements } = layout

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
  // against a new set of columns — reset whenever the visible slots actually change.
  // `layout` is a fresh reference exactly when the date or level range changes (not
  // on a showGca toggle) — and for THIS grid, unlike the room grid, the level range
  // directly determines the column set itself, not just which sessions are visible
  // within a data-derived set — see useDanceScheduleFilters.ts.
  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = 0
    }
    if (bodyRef.current) {
      bodyRef.current.scrollLeft = 0
    }
  }, [layout])

  if (placements.length === 0) {
    return <p className={styles.empty}>No sessions match the current filters.</p>
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
    <div className={styles.panelWrapper}>
      <div className={styles.headerWrapper} ref={headerRef}>
        <div className={styles.grid} style={{ gridTemplateColumns }}>
          <div className={styles.corner} style={{ gridRow: 1, gridColumn: 1 }} />
          {visibleSlots.map((slot, index) => (
            <div
              key={slot.label}
              className={styles.roomHeader}
              style={{ gridRow: 1, gridColumn: index + 2 }}
            >
              {slot.label}
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
            // Placements have no stable id of their own (a non-contiguous multi-
            // level or overlapping session produces several for the same session) —
            // index is stable per render.
            <SessionCard key={index} placement={placement} showGca={showGca} slots={visibleSlots} />
          ))}
        </div>
      </div>
    </div>
  )
}
