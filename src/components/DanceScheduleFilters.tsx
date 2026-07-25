import * as Slider from '@radix-ui/react-slider'
import { LEVEL_ORDER } from '../lib/levelOrder'
import styles from './DanceScheduleFilters.module.css'

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' })

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
        <span className={styles.label}>Date</span>
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

      <div className={styles.field}>
        <span className={styles.label}>
          Level: {LEVEL_ORDER[minLevelIndex]} – {LEVEL_ORDER[maxLevelIndex]}
        </span>
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
