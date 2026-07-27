import * as Slider from '@radix-ui/react-slider'
import type { LevelSlot } from '../lib/levelOrder'
import { moveNearestThumb } from '../lib/moveNearestThumb'
import styles from './DanceScheduleFilters.module.css'

// Weekday + day + month, no year — the year is never ambiguous within a single
// convention's schedule, and dropping it keeps each <option> (and the closed
// select's own display) short enough to help the vertical-footprint goal below.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

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
          GCA callers
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
                onClick={() => {
                  const { min, max } = moveNearestThumb(index, minLevelIndex, maxLevelIndex)
                  onLevelRangeChange(min, max)
                }}
              >
                {slot.label}
                {/* Decorative only — the button's accessible name is still just the
                    level text above, unaffected by this mark. */}
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
          <Slider.Thumb className={styles.sliderThumb} aria-label="Minimum level" />
          <Slider.Thumb className={styles.sliderThumb} aria-label="Maximum level" />
        </Slider.Root>
      </div>
    </div>
  )
}
