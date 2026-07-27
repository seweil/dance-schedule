import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DanceScheduleFilters } from './DanceScheduleFilters'
import { LEVEL_ORDER } from '../lib/levelOrder'

vi.mock('./DanceScheduleFilters.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

const DATES = [new Date('2026-07-02T00:00:00.000Z'), new Date('2026-07-03T00:00:00.000Z')]

function renderFilters(overrides: Partial<React.ComponentProps<typeof DanceScheduleFilters>> = {}) {
  const onDateChange = vi.fn()
  const onLevelRangeChange = vi.fn()
  const onShowGcaChange = vi.fn()

  render(
    <DanceScheduleFilters
      dates={DATES}
      selectedDate={DATES[0]!}
      onDateChange={onDateChange}
      minLevelIndex={0}
      maxLevelIndex={LEVEL_ORDER.length - 1}
      onLevelRangeChange={onLevelRangeChange}
      showGca
      onShowGcaChange={onShowGcaChange}
      {...overrides}
    />,
  )

  return { onDateChange, onLevelRangeChange, onShowGcaChange }
}

describe('DanceScheduleFilters', () => {
  it('renders a date option per date, with the selected date chosen', () => {
    renderFilters()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe(DATES[0]!.toISOString())
    expect(screen.getByRole('option', { name: /Thursday, July 2, 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Friday, July 3, 2026/ })).toBeInTheDocument()
  })

  it('calls onDateChange with the matching Date object when the selection changes', () => {
    const { onDateChange } = renderFilters()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: DATES[1]!.toISOString() } })
    expect(onDateChange).toHaveBeenCalledWith(DATES[1])
  })

  it('renders two slider thumbs with correct min/max ARIA values', () => {
    renderFilters({ minLevelIndex: 2, maxLevelIndex: 7 })
    const [minThumb, maxThumb] = screen.getAllByRole('slider')
    expect(minThumb).toHaveAttribute('aria-valuenow', '2')
    expect(maxThumb).toHaveAttribute('aria-valuenow', '7')
  })

  it('calls onLevelRangeChange when the minimum thumb is moved with the keyboard', () => {
    const { onLevelRangeChange } = renderFilters({ minLevelIndex: 2, maxLevelIndex: 7 })
    const [minThumb] = screen.getAllByRole('slider')
    minThumb!.focus()
    fireEvent.keyDown(minThumb!, { key: 'ArrowRight' })
    expect(onLevelRangeChange).toHaveBeenCalledWith(3, 7)
  })

  it('renders one labeled, clickable tick per level, each with a visible mark above the label', () => {
    renderFilters()
    for (const level of LEVEL_ORDER) {
      const tick = screen.getByRole('button', { name: level })
      expect(tick).toBeInTheDocument()
      // The mark is decorative (aria-hidden) — doesn't affect the button's
      // accessible name above, but should still be present in the DOM.
      expect(tick.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    }
  })

  it('clicking a tick above the current range extends the max thumb to it', () => {
    const { onLevelRangeChange } = renderFilters({ minLevelIndex: 0, maxLevelIndex: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'C1' }))
    expect(onLevelRangeChange).toHaveBeenCalledWith(0, LEVEL_ORDER.indexOf('C1'))
  })

  it('clicking a tick below the current range moves the min thumb to it', () => {
    const { onLevelRangeChange } = renderFilters({ minLevelIndex: 4, maxLevelIndex: 9 })
    fireEvent.click(screen.getByRole('button', { name: 'SSD' }))
    expect(onLevelRangeChange).toHaveBeenCalledWith(0, 9)
  })

  it('clicking a tick inside the current range moves whichever thumb is closer', () => {
    const { onLevelRangeChange } = renderFilters({ minLevelIndex: 0, maxLevelIndex: 9 })
    // 'A2' (index 4) is closer to min (0) than to max (9).
    fireEvent.click(screen.getByRole('button', { name: 'A2' }))
    expect(onLevelRangeChange).toHaveBeenCalledWith(LEVEL_ORDER.indexOf('A2'), 9)
  })

  it('renders the GCA checkbox reflecting showGca and calls onShowGcaChange when toggled', () => {
    const { onShowGcaChange } = renderFilters({ showGca: true })
    const checkbox = screen.getByRole('checkbox', { name: /show gca callers/i })
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(onShowGcaChange).toHaveBeenCalledWith(false)
  })
})
