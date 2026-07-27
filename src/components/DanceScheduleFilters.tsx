import * as Slider from '@radix-ui/react-slider'
import { LEVEL_ORDER } from '../lib/levelOrder'
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
  minLevelIndex: number
  maxLevelIndex: number
  onLevelRangeChange: (minLevelIndex: number, maxLevelIndex: number) => void
  showGca: boolean
  onShowGcaChange: (showGca: boolean) => void
}

// Date combo-box, dual-thumb skill-level slider, and GCA-visibility checkbox for
// DanceSchedulePage — purely presentational, all state owned by useDanceScheduleFilters.
export function DanceScheduleFilters({
  dates,
  selectedDate,
  onDateChange,
  minLevelIndex,
  maxLevelIndex,
  onLevelRangeChange,
  showGca,
  onShowGcaChange,
}: DanceScheduleFiltersProps) {
  return (
    <div className={styles.filters}>
      <label className={styles.field}>
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

      <div className={`${styles.field} ${styles.levelField}`}>
        {/* Radix positions each thumb's CENTER inset by half its own width from the
            track's ends (confirmed live: an 8px inset for the 1rem/16px thumb) — each
            tick's `left` is computed the same way (8px to calc(100% - 8px)) and
            re-centered via the .tick CSS rule's transform, so tick N lines up under
            thumb position N exactly, regardless of that label's own text width. Above
            the slider, not below — the mark sits under the label (closest to the
            slider) so the reading order is label, mark, then the track it belongs to. */}
        <div className={styles.ticks}>
          {LEVEL_ORDER.map((level, index) => {
            const fraction = index / (LEVEL_ORDER.length - 1)
            return (
              <button
                key={level}
                type="button"
                className={styles.tick}
                style={{ left: `calc(8px + (100% - 16px) * ${fraction})` }}
                onClick={() => {
                  const { min, max } = moveNearestThumb(index, minLevelIndex, maxLevelIndex)
                  onLevelRangeChange(min, max)
                }}
              >
                {level}
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
          max={LEVEL_ORDER.length - 1}
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

      <label className={styles.checkboxField}>
        <input type="checkbox" checked={showGca} onChange={(event) => onShowGcaChange(event.target.checked)} />
        Show GCA callers
      </label>
    </div>
  )
}
