import * as Slider from '@radix-ui/react-slider'
import type { LevelSlot } from '../lib/levelOrder'
import { moveNearestThumb } from '../lib/moveNearestThumb'
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

// Weekday + day + month, no year — the year is never ambiguous within a single
// convention's schedule, and dropping it keeps each <option> (and the closed
// select's own display) short enough to help the vertical-footprint goal below.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

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
  showGca: boolean
  onShowGcaChange: (showGca: boolean) => void
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
  showGca,
  onShowGcaChange,
}: DanceScheduleFiltersProps) {
  const { textSize } = useTextSize()
  const isNarrowPortrait = useMediaQuery(NARROW_PORTRAIT_QUERY)
  const shortenA1A2Tick = textSize === 'x-large' && isNarrowPortrait

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

        <label className={styles.checkboxField}>
          <input type="checkbox" checked={showGca} onChange={(event) => onShowGcaChange(event.target.checked)} />
          Show GCA callers
        </label>
      </div>

      <div className={`${styles.field} ${styles.levelField}`}>
        {/* Radix positions each thumb's CENTER inset by half its own width from the
            track's ends (confirmed live: an 8px inset for the 1rem/16px thumb) — each
            tick's `left` is computed the same way (8px to calc(100% - 8px)) and
            re-centered via the .tick CSS rule's transform, so tick N lines up under
            thumb position N exactly, regardless of that label's own text width. Above
            the slider, not below — the mark sits under the label (closest to the
            slider) so the reading order is label, mark, then the track it belongs to. */}
        <div className={styles.ticks}>
          {slots.map((slot, index) => {
            const fraction = index / (slots.length - 1)
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
          min={0}
          max={slots.length - 1}
          step={1}
          value={[minLevelIndex, maxLevelIndex]}
          onValueChange={([min, max]) => {
            if (min !== undefined && max !== undefined) {
              onLevelRangeChange(min, max)
            }
          }}
        >
          <Slider.Track className={styles.sliderTrack}>
            <Slider.Range className={styles.sliderRange} />
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
