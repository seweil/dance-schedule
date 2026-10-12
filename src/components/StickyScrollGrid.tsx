import { useMemo, useRef, type ReactNode } from 'react'
import type { EmptyGridCell } from '../lib/computeEmptyGridCells'
import { createAxisTimeFormatter, type TimeMark } from '../lib/computeDanceScheduleTimeAxis'
import { computeNowLinePosition } from '../lib/computeNowLinePosition'
import { nowForOverride, parseNowOverride } from '../lib/nowOverride'
import { useLabelsCoveredByBadge } from '../hooks/useLabelsCoveredByBadge'
import { useSyncedGridScroll } from '../hooks/useSyncedGridScroll'
import { useWallClockNow } from '../hooks/useWallClockNow'
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
  const { panelRef, headerRef, setBodyRef } = useSyncedGridScroll(resetKey)
  const clockNow = useWallClockNow()
  // Read per render rather than memoized: cheap, and it picks up a changed URL on
  // the next re-render. See nowOverride.ts for the `?now=` format.
  const nowOverride = parseNowOverride(window.location.search)
  const now = nowOverride ? nowForOverride(timeMarks, nowOverride) : clockNow
  const nowTime = now?.getTime()
  const nowLine = useMemo(
    () => (nowTime === undefined ? null : computeNowLinePosition(timeMarks, new Date(nowTime))),
    [timeMarks, nowTime],
  )
  const nowLabel = useMemo(
    () => (nowTime === undefined ? '' : createAxisTimeFormatter().format(new Date(nowTime))),
    [nowTime],
  )
  const bodyGridRef = useRef<HTMLDivElement>(null)
  const nowBadgeRef = useRef<HTMLDivElement>(null)
  const coveredLabelRows = useLabelsCoveredByBadge(bodyGridRef, nowBadgeRef, nowLine)

  return (
    <div className={styles.panelWrapper} ref={panelRef}>
      {/* First children, not last — position: sticky only holds an element within
          the viewport once scrolling would otherwise carry its own natural (static)
          position past the sticky threshold. Placed after headerWrapper/bodyWrapper
          (which, between them, are the tallest thing on the page), their natural
          position starts far below the visible area, so top: 0 sticky never has
          anything to pull back into view — confirmed live, they silently never
          appeared. Leading with a zero-height natural position instead means they
          start already inside the viewport, exactly where sticky needs them. */}
      <div className={styles.edgeLeft} aria-hidden="true" />
      <div className={styles.edgeRight} aria-hidden="true" />
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
          ref={bodyGridRef}
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
              className={
                coveredLabelRows.has(mark.rowStart)
                  ? `${styles.timeLabel} ${styles.timeLabelCovered}`
                  : styles.timeLabel
              }
              style={{ gridRow: mark.rowStart, gridColumn: 1 }}
              data-time-label-row={mark.rowStart}
            >
              {mark.label}
            </div>
          ))}
          {/* Current-time line + badge: overlays spanning the grid rows between the
              two labels surrounding "now", each offset by the interpolated
              fraction — so the browser's own (content-sized) row heights do the
              scaling, with no DOM measurement. The line covers the session
              columns and is deliberately rendered BEFORE the cards: it shares a
              stacking level with the (position: relative) card text, so tree
              order puts it above card backgrounds but under their text — see
              .nowRow in the CSS module. The badge is its own time-column item so
              it can stay sticky-pinned left like .timeLabel. */}
          {nowLine && (
            <div
              className={styles.nowRow}
              style={{ gridRow: `${nowLine.rowStart} / ${nowLine.rowEnd}`, gridColumn: '2 / -1' }}
              data-testid="now-line"
              aria-hidden="true"
            >
              <div className={styles.nowLine} style={{ top: `${nowLine.fraction * 100}%` }} />
            </div>
          )}
          {children}
          {nowLine && (
            <div
              className={styles.nowBadgeRow}
              style={{ gridRow: `${nowLine.rowStart} / ${nowLine.rowEnd}`, gridColumn: 1 }}
            >
              <div
                ref={nowBadgeRef}
                className={styles.nowBadge}
                style={{ top: `${nowLine.fraction * 100}%` }}
                data-testid="now-badge"
              >
                {nowLabel}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.edgeLeft} aria-hidden="true" />
      <div className={styles.edgeRight} aria-hidden="true" />
    </div>
  )
}
