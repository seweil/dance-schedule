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

  it('shows the current level range as level names', () => {
    renderFilters({ minLevelIndex: LEVEL_ORDER.indexOf('Plus'), maxLevelIndex: LEVEL_ORDER.indexOf('C2') })
    expect(screen.getByText('Level: Plus – C2')).toBeInTheDocument()
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

  it('renders the GCA checkbox reflecting showGca and calls onShowGcaChange when toggled', () => {
    const { onShowGcaChange } = renderFilters({ showGca: true })
    const checkbox = screen.getByRole('checkbox', { name: /show gca callers/i })
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(onShowGcaChange).toHaveBeenCalledWith(false)
  })
})
