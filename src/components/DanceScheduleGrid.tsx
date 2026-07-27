import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import type { DanceScheduleLayout, DanceSessionPlacement } from '../lib/computeDanceScheduleLayout'
import {
  formatSessionCallers,
  formatSessionEventTypePrefix,
  formatSessionGca,
  formatSessionLevels,
  formatSessionTimeRange,
} from '../lib/formatDanceSession'
import { colorForSession } from '../lib/levelColors'
import styles from './DanceScheduleGrid.module.css'

// One 15-minute row unit's pixel height — see computeDanceScheduleLayout.ts for why
// 15 minutes is the grid's time granularity. Two values, not one: showGca is a
// single global toggle (not per-card), so hiding it uniformly drops one line of
// content from every card that has GCA data — the whole grid can compact to match,
// not just cards that happen to lose a line. 18, not a more aggressive 16 — chosen
// live: 16 visibly compresses the common (1hr/45min) case just as well, but also
// measurably worsens a separate, pre-existing overflow issue (very short sessions
// with long wrapping text clip regardless of this toggle — see
// docs/known-issues.md) for cards that don't even have GCA data to hide in the
// first place. 18 keeps that collateral impact smaller while still delivering
// visible compaction for the common case this feature is actually for.
const UNIT_HEIGHT_PX_WITH_GCA = 20
const UNIT_HEIGHT_PX_WITHOUT_GCA = 18
const TIME_COLUMN_WIDTH = '70px'
// Fixed, not minmax(150px, 1fr) — headerGrid and bodyGrid are separate grid
// containers that only share this computed string, not actual measured layout, so a
// flexible 1fr track can resolve to a different pixel width in each (each grid's own
// content — short room names vs. longer session-card text — independently drives its
// intrinsic sizing once the box has to be at least content-sized; see the .grid
// comment in the CSS module). A fixed width guarantees both grids agree exactly,
// keeping header and body columns aligned at any scroll position. Tradeoff: room
// columns no longer stretch to fill extra width on desktop when there are few rooms
// (blank space to the right instead) — acceptable for now; revisit with a measured
// (ResizeObserver-driven) shared width if that space needs to be reclaimed later.
const ROOM_COLUMN_WIDTH = '150px'

function SessionCard({ placement, showGca }: { placement: DanceSessionPlacement; showGca: boolean }) {
  const { session, rowStart, rowSpan, columnStart, columnSpan } = placement
  const isRoomless = session.location.kind === 'roomless'
  const style: CSSProperties = {
    // bodyGrid has no header row of its own to offset past — layout.rowStart is
    // already 1-based for the first time unit (see computeDanceScheduleLayout.ts and
    // docs/design/dance-schedule-mobile-scroll.md).
    gridRow: `${rowStart} / span ${rowSpan}`,
    gridColumn: `${columnStart + 2} / span ${columnSpan}`,
    // Roomless cards keep their own neutral/centered treatment from the CSS module —
    // only room cards are colored by level.
    backgroundColor: isRoomless ? undefined : colorForSession(session),
  }
  const levels = formatSessionLevels(session)
  const gca = formatSessionGca(session)

  return (
    <div className={isRoomless ? styles.roomlessCard : styles.card} style={style}>
      <div>
        {levels && <p className={styles.levels}>{levels}</p>}
        <p className={styles.details}>
          {session.kind === 'freeform' ? (
            session.description
          ) : (
            <>
              {formatSessionEventTypePrefix(session)}
              <strong>{formatSessionCallers(session)}</strong>
            </>
          )}
        </p>
        {isRoomless && <p className={styles.gca}>{formatSessionTimeRange(session)}</p>}
        {!isRoomless && showGca && gca && <p className={styles.gca}>GCA: {gca}</p>}
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
export function DanceScheduleGrid({ layout, showGca }: { layout: DanceScheduleLayout; showGca: boolean }) {
  const { visibleRooms, totalRowUnits, hourMarks, halfHourMarks, placements } = layout

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
  const unitHeightPx = showGca ? UNIT_HEIGHT_PX_WITH_GCA : UNIT_HEIGHT_PX_WITHOUT_GCA

  return (
    <div className={styles.panelWrapper}>
      <div className={styles.headerWrapper} ref={headerRef}>
        <div className={styles.grid} style={{ gridTemplateColumns }}>
          <div className={styles.corner} style={{ gridRow: 1, gridColumn: 1 }} />
          {visibleRooms.map((room, index) => (
            <div key={room} className={styles.roomHeader} style={{ gridRow: 1, gridColumn: index + 2 }}>
              {room}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bodyWrapper} ref={setBodyRef}>
        <div
          className={styles.grid}
          style={{ gridTemplateColumns, gridTemplateRows: `repeat(${totalRowUnits}, ${unitHeightPx}px)` }}
        >
          {hourMarks.map((mark) => (
            <div
              key={mark.rowStart}
              className={styles.timeLabel}
              style={{ gridRow: mark.rowStart, gridColumn: 1 }}
            >
              {mark.label}
            </div>
          ))}
          {halfHourMarks.map((rowStart) => (
            <div
              key={rowStart}
              className={styles.halfHourTick}
              style={{ gridRow: rowStart, gridColumn: 1 }}
            />
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
