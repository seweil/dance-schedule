import type { CSSProperties } from 'react'
import type { DanceScheduleLayout, DanceSessionPlacement } from '../lib/computeDanceScheduleLayout'
import {
  formatSessionCallerDetails,
  formatSessionGca,
  formatSessionLevels,
  formatSessionTimeRange,
} from '../lib/formatDanceSession'
import { colorForSession } from '../lib/levelColors'
import styles from './DanceScheduleGrid.module.css'

// One 15-minute row unit's pixel height — see computeDanceScheduleLayout.ts for why
// 15 minutes is the grid's time granularity.
const UNIT_HEIGHT_PX = 20
const TIME_COLUMN_WIDTH = '70px'
const ROOM_COLUMN_MIN_WIDTH = '150px'

function SessionCard({ placement, showGca }: { placement: DanceSessionPlacement; showGca: boolean }) {
  const { session, rowStart, rowSpan, columnStart, columnSpan } = placement
  const isRoomless = session.location.kind === 'roomless'
  const style: CSSProperties = {
    gridRow: `${rowStart + 1} / span ${rowSpan}`,
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
        <p className={styles.details}>{formatSessionCallerDetails(session)}</p>
        {isRoomless && <p className={styles.gca}>{formatSessionTimeRange(session)}</p>}
        {!isRoomless && showGca && gca && <p className={styles.gca}>GCA: {gca}</p>}
      </div>
    </div>
  )
}

// The time-proportional calendar grid for one date: rooms as columns, real clock time
// as rows, with a sticky header row and sticky time-axis column so both stay visible
// while scrolling — the same layout on desktop and mobile, just more/less horizontal
// scrolling depending on viewport width and room count. See computeDanceScheduleLayout
// for how `layout` is derived (room order/visibility, time bounds, placements).
export function DanceScheduleGrid({ layout, showGca }: { layout: DanceScheduleLayout; showGca: boolean }) {
  const { visibleRooms, totalRowUnits, hourMarks, halfHourMarks, placements } = layout

  if (placements.length === 0) {
    return <p className={styles.empty}>No sessions match the current filters.</p>
  }

  const gridTemplateColumns = `${TIME_COLUMN_WIDTH} repeat(${Math.max(visibleRooms.length, 1)}, minmax(${ROOM_COLUMN_MIN_WIDTH}, 1fr))`
  const gridTemplateRows = `auto repeat(${totalRowUnits}, ${UNIT_HEIGHT_PX}px)`

  return (
    <div className={styles.scrollContainer}>
      <div className={styles.grid} style={{ gridTemplateColumns, gridTemplateRows }}>
        <div className={styles.corner} style={{ gridRow: 1, gridColumn: 1 }} />
        {visibleRooms.map((room, index) => (
          <div key={room} className={styles.roomHeader} style={{ gridRow: 1, gridColumn: index + 2 }}>
            {room}
          </div>
        ))}
        {hourMarks.map((mark) => (
          <div
            key={mark.rowStart}
            className={styles.timeLabel}
            style={{ gridRow: mark.rowStart + 1, gridColumn: 1 }}
          >
            {mark.label}
          </div>
        ))}
        {halfHourMarks.map((rowStart) => (
          <div
            key={rowStart}
            className={styles.halfHourTick}
            style={{ gridRow: rowStart + 1, gridColumn: 1 }}
          />
        ))}
        {placements.map((placement, index) => (
          // Placements have no stable id of their own (a non-contiguous multi-room
          // session produces several for the same session) — index is stable per render.
          <SessionCard key={index} placement={placement} showGca={showGca} />
        ))}
      </div>
    </div>
  )
}
