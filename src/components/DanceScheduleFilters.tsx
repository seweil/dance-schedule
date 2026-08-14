import { useMemo, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import type { LevelSlot } from '../lib/levelOrder'
import { moveNearestThumb } from '../lib/moveNearestThumb'
import { getUserLocales } from '../lib/userLocale'
import { useTextSize } from '../hooks/useTextSize'
import { useMediaQuery } from '../hooks/useMediaQuery'
import styles from './DanceScheduleFilters.module.css'

// The specific combination that actually needs the "A1/A2" → "A" shortening
// below: a portrait phone (not a wider portrait tablet, not landscape, where
// there's already enough room) AT Extra Large text size (not Normal/Large,
// where the un-shortened "A1/A2" already fits fine — confirmed live). 480px,
// not Nav.module.css's own 640px mobile breakpoint — that one marks "narrow
// enough that the desktop tab bar doesn't make sense," a different, more
// generous threshold than "narrow enough that this one label needs to
// shrink."
const NARROW_PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 480px)'

// More than about three-quarters of an inch between two adjacent ticks stops
// feeling like one continuous, easy-to-scan control — particularly for
// mouse/touch precision aiming for a specific one on a wide desktop monitor,
// where .levelField's own flex-grow: 1 (DanceScheduleFilters.module.css)
// would otherwise stretch it to fill however wide the row happens to be —
// per direct product decision (half an inch, tried first, measured live as
// a bit too tight). 72px is the standard CSS reference pixel's own
// three-quarter-inch (96px/in). Physical, not rem — unlike most sizing in
// this app, ergonomic tick spacing doesn't get more generous just because
// someone prefers larger text (useTextSizePreference.ts); it's a
// motor-control constraint, not a legibility one. Computed from the actual
// slot count below, not a single fixed constant, so it stays correct
// regardless of the combineA1A2/combineC3BC4 config — fewer slots means
// fewer, WIDER gaps for a given width, so fewer slots need a SMALLER cap to
// keep each individual gap within budget.
const MAX_TICK_GAP_PX = 72

// Matches the tick `left` calc's own 8px-per-side inset below (mirroring
// Radix's own thumb-centering inset) plus .levelField's own
// `padding: 0 0.5rem` at the unscaled (Normal) text size — both live inside
// the capped width below, not outside it, so they need to be budgeted for
// too, not just the gaps between ticks themselves.
const LEVEL_FIELD_FIXED_INSET_PX = 32

// Shortens just this slider's own combined-A1/A2 tick label to "A" — per
// direct product decision, "A1/A2" was consistently the widest label of the
// set (wider even than "C3B+"), and the single biggest obstacle to fitting
// every tick without an adjacent pair touching. Only called when
// `shortenA1A2Tick` is true (see NARROW_PORTRAIT_QUERY above) — everywhere
// else, "A1/A2" already fits fine on its own (confirmed live), and the full
// name reads better when there's room for it. Scoped to THIS component's own
// visible tick text only — `slot.label` itself (the React `key` below, and
// DanceScheduleLevelGrid.tsx's own column header, which has more room per
// column and isn't asked to abbreviate) stays "A1/A2".
function tickText(label: string): string {
  return label === 'A1/A2' ? 'A' : label
}

export interface DanceScheduleFiltersProps {
  dates: Date[]
  selectedDate: Date
  onDateChange: (date: Date) => void
  slots: readonly LevelSlot[]
  minLevelIndex: number
  maxLevelIndex: number
  onLevelRangeChange: (minLevelIndex: number, maxLevelIndex: number) => void
  // Trims the slider's own draggable range (and rendered ticks) down to what's
  // actually scheduled on the selected date — see getPresentLevelIndexRange
  // (levelOrder.ts) and useDanceScheduleFilters, which computes these.
  minPresentLevelIndex: number
  maxPresentLevelIndex: number
  showGca: boolean
  onShowGcaChange: (showGca: boolean) => void
  // Omits the "Show GCA callers" checkbox entirely when the selected date has no GCA
  // caller-credit lines for it to toggle.
  hasGcaOnSelectedDate: boolean
}

// Date combo-box, GCA-visibility checkbox, and dual-thumb skill-level slider for
// DanceSchedulePage — purely presentational, all state owned by useDanceScheduleFilters.
// Rendered in that order (Date, GCA, Levels); Date and GCA are grouped in their own
// row so they stay paired even when the wider level field wraps below on mobile.
// `slots` (from getLevelSlots, via the combineA1A2 feature flag) determines the
// slider's tick count/labels — not hardcoded to LEVEL_ORDER, so a combined A1/A2
// stop renders here with no changes needed to this component beyond taking slots
// as a prop.
export function DanceScheduleFilters({
  dates,
  selectedDate,
  onDateChange,
  slots,
  minLevelIndex,
  maxLevelIndex,
  onLevelRangeChange,
  minPresentLevelIndex,
  maxPresentLevelIndex,
  showGca,
  onShowGcaChange,
  hasGcaOnSelectedDate,
}: DanceScheduleFiltersProps) {
  const { textSize } = useTextSize()
  const isNarrowPortrait = useMediaQuery(NARROW_PORTRAIT_QUERY)
  // Drives the ghost preview marker on the track (.ghostThumb) — which slot's
  // tick, if any, the pointer is currently over. null, not -1: every real slot
  // index (including 0) must stay a valid "this one's hovered" value.
  const [hoveredTickIndex, setHoveredTickIndex] = useState<number | null>(null)
  // Weekday + day + month, no year — the year is never ambiguous within a single
  // convention's schedule, and dropping it keeps each <option> (and the closed
  // select's own display) short enough to help the vertical-footprint goal below.
  // useMemo (not a module-level const, unlike this file's fixed layout constants)
  // so it reflects the viewer's own locale (getUserLocales) rather than a fixed one
  // — unlike the UTC pin, which must never vary by viewer.
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(getUserLocales(), { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    [],
  )
  const shortenA1A2Tick = textSize === 'x-large' && isNarrowPortrait
  // Ticks only render for slots within [minPresentLevelIndex, maxPresentLevelIndex] —
  // the visible tick count (not slots.length) is what the field's width should budget
  // for, or it reserves dead whitespace for hidden ticks.
  const presentLevelIndexSpan = maxPresentLevelIndex - minPresentLevelIndex
  // Math.max(..., 1) guards the degenerate single-present-slot day (span 0), so the
  // field still reserves one tick-gap's worth of room instead of collapsing to just
  // its fixed inset.
  const maxLevelFieldWidthPx = LEVEL_FIELD_FIXED_INSET_PX + Math.max(presentLevelIndexSpan, 1) * MAX_TICK_GAP_PX
  const visibleSlots = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ index }) => index >= minPresentLevelIndex && index <= maxPresentLevelIndex)

  return (
    <div className={styles.filters}>
      {/* Grouped so Date and GCA always share one row — both are narrow controls
          that comfortably fit side by side even on a narrow mobile viewport, while
          the wider level field (min-width: 17rem) wraps below on its own. */}
      <div className={styles.dateGcaRow}>
        <label className={`${styles.field} ${styles.dateField}`}>
          <span className={styles.visuallyHidden}>Date</span>
          <select
            className={styles.select}
            value={selectedDate.toISOString()}
            onChange={(event) => {
              const next = dates.find((date) => date.toISOString() === event.target.value)
              if (next) {
                onDateChange(next)
              }
            }}
          >
            {dates.map((date) => (
              <option key={date.toISOString()} value={date.toISOString()}>
                {dateFormatter.format(date)}
              </option>
            ))}
          </select>
        </label>

        {hasGcaOnSelectedDate && (
          <label className={styles.checkboxField}>
            <input type="checkbox" checked={showGca} onChange={(event) => onShowGcaChange(event.target.checked)} />
            Show GCA callers
          </label>
        )}
      </div>

      <div
        className={`${styles.field} ${styles.levelField}`}
        // `width`, not just `maxWidth` — with .levelField's own flex-grow: 1
        // (DanceScheduleFilters.module.css) still in play, it would greedily
        // fill 100% of whatever space was left on its line up to this cap,
        // which only leaves room for .filters's justify-content: center to
        // add visible margins once the cap actually binds (a wide-enough
        // desktop). Below that width — confirmed live to be the common
        // desktop case, not a rare edge one — flex-grow ate all the leftover
        // space itself, rendering the field flush against both edges with
        // zero margin: "too tight," and asymmetric-looking depending on
        // rounding. Setting `width` to the same value as the cap makes this
        // the field's own PREFERRED size (its flex-basis) instead, so
        // flex-grow (now 0 — see that rule's own comment) never has anything
        // to do: the field renders at exactly this width whenever there's
        // room, leaving justify-content free to center it consistently at
        // every desktop width, not just the widest ones.
        style={{ width: `${maxLevelFieldWidthPx}px`, maxWidth: `${maxLevelFieldWidthPx}px` }}
      >
        {/* Radix positions each thumb's CENTER inset by half its own width from the
            track's ends (confirmed live: an 8px inset for the 1rem/16px thumb) — each
            tick's `left` is computed the same way (8px to calc(100% - 8px)) and
            re-centered via the .tick CSS rule's transform, so tick N lines up under
            thumb position N exactly, regardless of that label's own text width. Above
            the slider, not below — the mark sits under the label (closest to the
            slider) so the reading order is label, mark, then the track it belongs to. */}
        <div className={styles.ticks}>
          {visibleSlots.map(({ slot, index }) => {
            const fraction = presentLevelIndexSpan > 0 ? (index - minPresentLevelIndex) / presentLevelIndexSpan : 0.5
            return (
              <button
                key={slot.label}
                type="button"
                className={styles.tick}
                style={{ left: `calc(8px + (100% - 16px) * ${fraction})` }}
                // Full slot.label, not the conditionally-shortened text below — a
                // screen reader still announces "A1/A2," not the ambiguous "A"
                // sighted users see in the one narrow-portrait-Extra-Large case,
                // regardless of the visible-text shortening.
                aria-label={slot.label}
                onClick={() => {
                  const { min, max } = moveNearestThumb(index, minLevelIndex, maxLevelIndex)
                  onLevelRangeChange(min, max)
                }}
                onMouseEnter={() => setHoveredTickIndex(index)}
                onMouseLeave={() => setHoveredTickIndex((current) => (current === index ? null : current))}
              >
                {shortenA1A2Tick ? tickText(slot.label) : slot.label}
                {/* Decorative only — the button's accessible name is still just the
                    aria-label above, unaffected by this mark. */}
                <span className={styles.tickMark} aria-hidden="true" />
              </button>
            )
          })}
        </div>
        <Slider.Root
          className={styles.sliderRoot}
          min={minPresentLevelIndex}
          max={maxPresentLevelIndex}
          step={1}
          value={[minLevelIndex, maxLevelIndex]}
          onValueChange={([min, max]) => {
            if (min !== undefined && max !== undefined) {
              onLevelRangeChange(min, max)
            }
          }}
        >
          <Slider.Track
            className={styles.sliderTrack}
            // Continuous "near a setting" preview along the whole bar (both the
            // thin unselected track and the highlighted range), not just when
            // hovering a tick label above it — mirrors the ticks'/ghosts' own
            // "8px to calc(100% - 16px)" inset math in reverse, snapping the
            // raw cursor position to whichever slot index is closest.
            onMouseMove={(event) => {
              if (presentLevelIndexSpan <= 0) {
                setHoveredTickIndex(minPresentLevelIndex)
                return
              }
              const rect = event.currentTarget.getBoundingClientRect()
              const inset = 8
              const usableWidth = rect.width - inset * 2
              const rawFraction = usableWidth > 0 ? (event.clientX - rect.left - inset) / usableWidth : 0
              const fraction = Math.min(1, Math.max(0, rawFraction))
              setHoveredTickIndex(Math.round(minPresentLevelIndex + fraction * presentLevelIndexSpan))
            }}
            onMouseLeave={() => setHoveredTickIndex(null)}
          >
            <Slider.Range className={styles.sliderRange} />
            {/* Same left-fraction calc as the ticks above, so a ghost marker lines
                up exactly with the tick it previews. Shape (min- vs max-pointing
                triangle, matching .sliderThumbMin/.sliderThumbMax) comes from
                actually calling moveNearestThumb — the real function a click
                there would use — rather than guessing; see .ghostThumb's own
                comment for the "hovering the tick already at min/max" case this
                also has to account for. */}
            {visibleSlots.map(({ slot, index }) => {
              const fraction =
                presentLevelIndexSpan > 0 ? (index - minPresentLevelIndex) / presentLevelIndexSpan : 0.5
              const preview = moveNearestThumb(index, minLevelIndex, maxLevelIndex)
              const movesMin = preview.min !== minLevelIndex
              const movesMax = preview.max !== maxLevelIndex
              return (
                <span
                  key={slot.label}
                  className={styles.ghostThumb}
                  aria-hidden="true"
                  // Neither true means this tick IS the current min or max already
                  // — clicking it is a no-op, so there's nothing to preview (the
                  // real thumb is already sitting right there).
                  data-active={hoveredTickIndex === index && (movesMin || movesMax)}
                  data-thumb={movesMin ? 'min' : 'max'}
                  style={{ left: `calc(8px + (100% - 16px) * ${fraction})` }}
                />
              )
            })}
          </Slider.Track>
          {/* Triangles pointing at each other (not identical circles) so the pair
              itself reads as "the ends of a range," not just two independent
              handles — see .sliderThumbMin/.sliderThumbMax. */}
          <Slider.Thumb className={`${styles.sliderThumb} ${styles.sliderThumbMin}`} aria-label="Minimum level" />
          <Slider.Thumb className={`${styles.sliderThumb} ${styles.sliderThumbMax}`} aria-label="Maximum level" />
        </Slider.Root>
      </div>
    </div>
  )
}
