import type { ReactNode } from 'react'
import type { EmptyGridCell } from '../lib/computeEmptyGridCells'
import type { TimeMark } from '../lib/computeDanceScheduleTimeAxis'
import { useSyncedGridScroll } from '../hooks/useSyncedGridScroll'
import styles from './DanceScheduleGrid.module.css'

export interface StickyScrollGridColumn {
  key: string
  title: string
  label: ReactNode
}

export interface StickyScrollGridProps {
  columns: StickyScrollGridColumn[]
  gridTemplateColumns: string
  totalRows: number
  emptyCells: EmptyGridCell[]
  timeMarks: TimeMark[]
  // A fresh reference exactly when the date or level range changes — see
  // useSyncedGridScroll's own comment for why this resets scroll position.
  resetKey: unknown
  // The session cards themselves — the one thing that's genuinely different between
  // the three dance-schedule grids (room/level/caller), since each has its own
  // SessionCard rendering and placement type.
  children: ReactNode
}

// The two-grid sticky-scroll shell shared, byte-identically, by every dance-schedule
// grid (DanceScheduleGrid/DanceScheduleLevelGrid/DanceScheduleCallerGrid) — a pinned
// header row (corner + one cell per column) mirroring the body's own horizontal
// scroll position, plus the empty-cell gridlines and time-axis labels every one of
// them renders the same way. Only what a "column" represents (room/level slot/
// caller) and how a session card looks differ between the three — both captured by
// the `columns`/`children` props rather than by this component. Extracted once all
// three consumers turned out to have copy-pasted this shell verbatim — see
// docs/design/dance-schedule.md and docs/design/dance-schedule-mobile-scroll.md for
// the full rationale behind the shell itself.
export function StickyScrollGrid({
  columns,
  gridTemplateColumns,
  totalRows,
  emptyCells,
  timeMarks,
  resetKey,
  children,
}: StickyScrollGridProps) {
  const { headerRef, setBodyRef } = useSyncedGridScroll(resetKey)

  return (
    <div className={styles.panelWrapper}>
      <div className={styles.headerWrapper} ref={headerRef}>
        <div className={styles.grid} style={{ gridTemplateColumns }}>
          <div className={styles.corner} style={{ gridRow: 1, gridColumn: 1 }} />
          {columns.map((column, index) => (
            <div
              key={column.key}
              className={styles.roomHeader}
              style={{ gridRow: 1, gridColumn: index + 2 }}
              title={column.title}
            >
              {column.label}
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
          {children}
        </div>
      </div>
    </div>
  )
}
