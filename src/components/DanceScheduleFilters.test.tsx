import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DanceScheduleFilters } from './DanceScheduleFilters'
import { TextSizeProvider } from './TextSizeProvider'
import { LEVEL_ORDER, getLevelSlots } from '../lib/levelOrder'

vi.mock('./DanceScheduleFilters.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

const DATES = [new Date('2026-07-02T00:00:00.000Z'), new Date('2026-07-03T00:00:00.000Z')]
const BASE_SLOTS = getLevelSlots(false, false)
const COMBINED_SLOTS = getLevelSlots(true, false)
const C3B_COMBINED_SLOTS = getLevelSlots(false, true)

function renderFilters(overrides: Partial<ComponentProps<typeof DanceScheduleFilters>> = {}) {
  const onDateChange = vi.fn()
  const onLevelRangeChange = vi.fn()
  const onShowGcaChange = vi.fn()

  render(
    <TextSizeProvider>
      <DanceScheduleFilters
        dates={DATES}
        selectedDate={DATES[0]!}
        onDateChange={onDateChange}
        slots={BASE_SLOTS}
        minLevelIndex={0}
        maxLevelIndex={BASE_SLOTS.length - 1}
        onLevelRangeChange={onLevelRangeChange}
        showGca
        onShowGcaChange={onShowGcaChange}
        {...overrides}
      />
    </TextSizeProvider>,
  )

  return { onDateChange, onLevelRangeChange, onShowGcaChange }
}

describe('DanceScheduleFilters', () => {
  it('renders a date option per date (short — weekday, month, day, no year), with the selected date chosen', () => {
    renderFilters()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe(DATES[0]!.toISOString())
    expect(screen.getByRole('option', { name: 'Thu, Jul 2' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Fri, Jul 3' })).toBeInTheDocument()
  })

  it('gives the date select an accessible name of "Date" even though the label is visually hidden', () => {
    renderFilters()
    expect(screen.getByLabelText('Date')).toBe(screen.getByRole('combobox'))
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
    const maxIndex = BASE_SLOTS.length - 1
    const { onLevelRangeChange } = renderFilters({ minLevelIndex: 4, maxLevelIndex: maxIndex })
    fireEvent.click(screen.getByRole('button', { name: 'SSD' }))
    expect(onLevelRangeChange).toHaveBeenCalledWith(0, maxIndex)
  })

  it('clicking a tick inside the current range moves whichever thumb is closer', () => {
    const maxIndex = BASE_SLOTS.length - 1
    const { onLevelRangeChange } = renderFilters({ minLevelIndex: 0, maxLevelIndex: maxIndex })
    // 'A2' is closer to min (0) than to max (the last index).
    fireEvent.click(screen.getByRole('button', { name: 'A2' }))
    expect(onLevelRangeChange).toHaveBeenCalledWith(LEVEL_ORDER.indexOf('A2'), maxIndex)
  })

  describe('with A1/A2 combined', () => {
    it('renders 9 ticks, including one labeled "A1/A2" in place of separate A1 and A2 ticks', () => {
      renderFilters({ slots: COMBINED_SLOTS, maxLevelIndex: COMBINED_SLOTS.length - 1 })
      expect(screen.getByRole('button', { name: 'A1/A2' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'A1' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'A2' })).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /./ })).toHaveLength(COMBINED_SLOTS.length)
    })

    it('shows the full "A1/A2" label outside the narrow-portrait/Extra-Large case', () => {
      // The default jsdom matchMedia stub (test-setup.ts) always reports
      // "no match," so this covers every OTHER combination (any orientation/
      // width at Normal/Large, or a wide/landscape viewport at Extra Large)
      // without needing to mock each one individually.
      renderFilters({ slots: COMBINED_SLOTS, maxLevelIndex: COMBINED_SLOTS.length - 1 })
      const tick = screen.getByRole('button', { name: 'A1/A2' })
      expect(tick).toHaveTextContent('A1/A2')
    })

    it('shortens the tick text to "A" (but keeps the full accessible name) only at Extra Large on a narrow portrait viewport', () => {
      localStorage.setItem('dance-schedule:text-size', JSON.stringify('x-large'))
      vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList)

      renderFilters({ slots: COMBINED_SLOTS, maxLevelIndex: COMBINED_SLOTS.length - 1 })
      const tick = screen.getByRole('button', { name: 'A1/A2' })
      expect(tick).toHaveTextContent('A')
      expect(tick).not.toHaveTextContent('A1/A2')
    })

    it('clicking the combined tick sets the range using its slot index, not a raw LEVEL_ORDER index', () => {
      const maxIndex = COMBINED_SLOTS.length - 1
      const { onLevelRangeChange } = renderFilters({
        slots: COMBINED_SLOTS,
        minLevelIndex: 0,
        maxLevelIndex: maxIndex,
      })
      const a1a2Index = COMBINED_SLOTS.findIndex((slot) => slot.label === 'A1/A2')
      fireEvent.click(screen.getByRole('button', { name: 'A1/A2' }))
      // Index 4 in the 9-slot combined array (SSD, MS, Plus, A1/A2, ...) is closer
      // to min (0) than to max (8), so it moves the min thumb there.
      expect(onLevelRangeChange).toHaveBeenCalledWith(a1a2Index, maxIndex)
    })
  })

  describe('with C3B/C4 combined', () => {
    it('renders 9 ticks, including one labeled "C3B+" in place of separate C3B and C4 ticks', () => {
      renderFilters({ slots: C3B_COMBINED_SLOTS, maxLevelIndex: C3B_COMBINED_SLOTS.length - 1 })
      expect(screen.getByRole('button', { name: 'C3B+' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'C3B' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'C4' })).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /./ })).toHaveLength(C3B_COMBINED_SLOTS.length)
    })

    it('clicking the combined tick extends the range to its slot index, not a raw LEVEL_ORDER index', () => {
      const c3bIndex = C3B_COMBINED_SLOTS.findIndex((slot) => slot.label === 'C3B+')
      const { onLevelRangeChange } = renderFilters({
        slots: C3B_COMBINED_SLOTS,
        minLevelIndex: 0,
        maxLevelIndex: 2,
      })
      fireEvent.click(screen.getByRole('button', { name: 'C3B+' }))
      expect(onLevelRangeChange).toHaveBeenCalledWith(0, c3bIndex)
    })
  })

  it('renders the GCA checkbox reflecting showGca and calls onShowGcaChange when toggled', () => {
    const { onShowGcaChange } = renderFilters({ showGca: true })
    const checkbox = screen.getByRole('checkbox', { name: /gca callers/i })
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(onShowGcaChange).toHaveBeenCalledWith(false)
  })
})
