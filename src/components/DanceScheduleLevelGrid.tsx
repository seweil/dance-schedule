import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import type {
  DanceLevelSessionPlacement,
  DanceScheduleLevelLayout,
} from '../lib/computeDanceScheduleLevelLayout'
import { detailsContent, detailsPlainText } from '../lib/danceScheduleCardContent'
import {
  CARD_HORIZONTAL_OVERHEAD_PX,
  CARD_PADDING_PX,
  DETAILS_MEASUREMENT_FONT,
  UNIT_HEIGHT_PX_WITH_GCA,
  UNIT_HEIGHT_PX_WITHOUT_GCA,
} from '../lib/danceScheduleCardSizing'
import { shouldCombinePrimaryAndDetails } from '../lib/estimateCardFit'
import {
  formatSessionGca,
  formatSessionLevels,
  formatSessionRoom,
  formatSessionTimeRange,
} from '../lib/formatDanceSession'
import { colorForSession } from '../lib/levelColors'
import type { LevelSlot } from '../lib/levelOrder'
import { measureTextWidth } from '../lib/measureTextWidth'
// Reused as-is — the two grids share the exact same visual language (card, levels/
// details/gca lines, sticky headers, mobile scroll behavior); only what determines
// columns and what text is bold differs between them.
import styles from './DanceScheduleGrid.module.css'

const TIME_COLUMN_WIDTH = '70px'
// Same 150px starting point as the room-columns grid's own column width — room
// names (this grid's second card line) aren't reliably shorter than level codes
// were, so there's no a priori reason to start narrower. Kept independent of the
// room grid's own constant (not shared) since the two may need to diverge with
// real-world tuning.
const LEVEL_COLUMN_WIDTH_PX = 150
const LEVEL_COLUMN_WIDTH = `${LEVEL_COLUMN_WIDTH_PX}px`

function SessionCard({
  placement,
  showGca,
  unitHeightPx,
  slots,
}: {
  placement: DanceLevelSessionPlacement
  showGca: boolean
  unitHeightPx: number
  slots: readonly LevelSlot[]
}) {
  const { session, rowStart, rowSpan, columnStart, columnSpan, lane, laneCount, isDurationCompressed } = placement
  const isRoomless = session.location.kind === 'roomless'
  const style: CSSProperties = {
    // bodyGrid has no header row of its own to offset past — layout.rowStart is
    // already 1-based for the first time unit (see computeDanceScheduleTimeAxis.ts
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

  // A lane-split card's own box width is track/laneCount exactly (an explicit
  // percentage width, not grid-stretch-filled — see the style block above), so its
  // usable text width is that minus just the padding, not the combined margin+
  // padding overhead: margin sits outside a border-box element and doesn't shrink
  // its content area the way padding does. Only the ordinary (laneCount === 1,
  // grid-stretch-filled) case uses CARD_HORIZONTAL_OVERHEAD_PX, same as the
  // room-columns grid.
  const textWidthPx =
    laneCount > 1
      ? (columnSpan * LEVEL_COLUMN_WIDTH_PX) / laneCount - CARD_PADDING_PX
      : columnSpan * LEVEL_COLUMN_WIDTH_PX - CARD_HORIZONTAL_OVERHEAD_PX

  // Cards are a fixed, time-proportional height (rowSpan * unitHeightPx) that never
  // grows to fit content — see docs/known-issues.md's "long wrapping text clips on
  // very short sessions" entry. When a room line exists and the estimate says the
  // room + details (+ GCA) lines won't fit separately, combine them onto one line to
  // save the line break, rather than risk clipping. A lane-split card has less
  // actual width than its column's full track (see textWidthPx above), so it's more
  // likely to need combining, not less.
  const combineRoomAndDetails =
    !isRoomless &&
    !!room &&
    shouldCombinePrimaryAndDetails(
      {
        primaryText: room,
        detailsText: detailsPlainText(session, levelPrefix),
        hasGcaLine: showGcaLine,
        availableHeightPx: rowSpan * unitHeightPx,
        textWidthPx,
      },
      (text) => measureTextWidth(text, DETAILS_MEASUREMENT_FONT),
    )

  // A jagged/torn bottom edge (CSS module) signals that this card's height was
  // capped short of the session's real duration — see capRoomlessRowSpan.
  const roomlessClassName =
    isDurationCompressed ? `${styles.roomlessCard} ${styles.roomlessCardCompressed}` : styles.roomlessCard

  return (
    <div className={isRoomless ? roomlessClassName : styles.card} style={style}>
      <div>
        {combineRoomAndDetails ? (
          <p className={styles.details}>
            {detailsContent(session, levelPrefix)}
            {room && <> {room}</>}
          </p>
        ) : (
          <>
            <p className={styles.details}>{detailsContent(session, levelPrefix)}</p>
            {room && <p className={styles.details}>{room}</p>}
          </>
        )}
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
  const { visibleSlots, totalRowUnits, hourMarks, halfHourMarks, placements } = layout

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

  const gridTemplateColumns = `${TIME_COLUMN_WIDTH} repeat(${Math.max(visibleSlots.length, 1)}, ${LEVEL_COLUMN_WIDTH})`
  const unitHeightPx = showGca ? UNIT_HEIGHT_PX_WITH_GCA : UNIT_HEIGHT_PX_WITHOUT_GCA

  return (
    <div className={styles.panelWrapper}>
      <div className={styles.headerWrapper} ref={headerRef}>
        <div className={styles.grid} style={{ gridTemplateColumns }}>
          <div className={styles.corner} style={{ gridRow: 1, gridColumn: 1 }} />
          {visibleSlots.map((slot, index) => (
            <div key={slot.label} className={styles.roomHeader} style={{ gridRow: 1, gridColumn: index + 2 }}>
              {slot.label}
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
            // Placements have no stable id of their own (a non-contiguous multi-
            // level or overlapping session produces several for the same session) —
            // index is stable per render.
            <SessionCard
              key={index}
              placement={placement}
              showGca={showGca}
              unitHeightPx={unitHeightPx}
              slots={visibleSlots}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
