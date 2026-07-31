import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import {
  ROOM_COLUMN_WIDTH,
  type DanceScheduleLayout,
  type DanceSessionPlacement,
} from '../lib/computeDanceScheduleLayout'
import { computeEmptyGridCells } from '../lib/computeEmptyGridCells'
import { detailsContent } from '../lib/danceScheduleCardContent'
import { formatSessionGca, formatSessionLevels, formatSessionTimeRange } from '../lib/formatDanceSession'
import { colorForSession } from '../lib/levelColors'
import styles from './DanceScheduleGrid.module.css'

const TIME_COLUMN_WIDTH = '70px'

function SessionCard({ placement, showGca }: { placement: DanceSessionPlacement; showGca: boolean }) {
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
      <div>
        {levels && <p className={styles.levels}>{levels}</p>}
        <p className={styles.details}>{detailsContent(session)}</p>
        {isRoomless && <p className={styles.gca}>{formatSessionTimeRange(session)}</p>}
        {showGcaLine && <p className={styles.gca}>GCA: {gca}</p>}
      </div>
    </div>
  )
}

// Two independently-scrollable grids sharing one computed gridTemplateColumns so
// their room columns stay aligned — full rationale in
// docs/design/dance-schedule-mobile-scroll.md. headerGrid (corner + room names) is
// wrapped so it can stay pinned to the viewport's top on small screens; bodyGrid
// (time axis + session cards) is wrapped as the actual horizontally-scrollable area
// there, with its scroll position mirrored onto the header (which has no scrollbar
// of its own — see the CSS module). Above the mobile breakpoint, both wrappers sit
// inside one shared scrollable panel exactly like the single grid this replaced —
// same visual result, no JS involved (the listener below is naturally inert there).
export function DanceScheduleGrid({
  layout,
  showGca,
}: {
  layout: DanceScheduleLayout
  showGca: boolean
}) {
  const { visibleRooms, totalRows, timeMarks, placements } = layout

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
  // against a new set of rooms — reset whenever the visible rooms actually change.
  // `layout` is a fresh reference exactly when the date or level range changes (not
  // on a showGca toggle, which doesn't affect which rooms are visible) — see
  // useDanceScheduleFilters.ts.
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

  const gridTemplateColumns = `${TIME_COLUMN_WIDTH} repeat(${Math.max(visibleRooms.length, 1)}, ${ROOM_COLUMN_WIDTH})`
  const emptyCells = computeEmptyGridCells(totalRows, visibleRooms.length, placements)

  return (
    <div className={styles.panelWrapper}>
      <div className={styles.headerWrapper} ref={headerRef}>
        <div className={styles.grid} style={{ gridTemplateColumns }}>
          <div className={styles.corner} style={{ gridRow: 1, gridColumn: 1 }} />
          {visibleRooms.map((room, index) => (
            <div
              key={room}
              className={styles.roomHeader}
              style={{ gridRow: 1, gridColumn: index + 2 }}
            >
              {room}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bodyWrapper} ref={setBodyRef}>
        <div
          className={styles.grid}
          style={{
            gridTemplateColumns,
            // auto, not a fixed px value — a row sizes to the tallest content
            // actually touching it (including correctly distributing a row-
            // spanning card's height need across the rows it spans, standard CSS
            // Grid track-sizing behavior). The 28px floor keeps a row carrying
            // only a time label (no card) from collapsing to a cramped sliver.
            // The actual growth ceiling lives on the card text itself (line-clamp
            // in DanceScheduleGrid.module.css), not here — a max on the track
            // can't prevent overflow (a track's min-content floor wins over its
            // own max in CSS Grid's sizing algorithm), so capping has to happen
            // on the content, not the track.
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
            // Placements have no stable id of their own (a non-contiguous multi-room
            // session produces several for the same session) — index is stable per render.
            <SessionCard key={index} placement={placement} showGca={showGca} />
          ))}
        </div>
      </div>
    </div>
  )
}
