import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DanceScheduleFilters } from './DanceScheduleFilters'
import { TextSizeProvider } from './TextSizeProvider'
import { useFirstLaunchHint } from '../hooks/useFirstLaunchHint'
import { LEVEL_ORDER, getLevelSlots } from '../lib/levelOrder'

afterEach(() => {
  Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true })
  // stubHoverCapable() below mocks window.matchMedia to always report a
  // match, for every query — without restoring it here, that leaked into
  // later tests in this file that rely on the default "no match" stub
  // (test-setup.ts), including the level-slider onboarding hint tests below
  // once they started reading matchMedia too (PHONE_QUERY, for suppressing
  // that hint while FirstRunTextSizePrompt.tsx's own modal is up) — same
  // "restoring afterward keeps mocks from leaking into other tests" reasoning
  // RotateDeviceBanner.test.tsx's own mockPortraitPhone() comment describes.
  vi.restoreAllMocks()
})

vi.mock('./DanceScheduleFilters.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

const DATES = [new Date('2026-07-02T00:00:00.000Z'), new Date('2026-07-03T00:00:00.000Z')]
const BASE_SLOTS = getLevelSlots(false, false)
const COMBINED_SLOTS = getLevelSlots(true, false)
const C3B_COMBINED_SLOTS = getLevelSlots(false, true)

// The default jsdom matchMedia stub (test-setup.ts) always reports "no
// match" — including for (hover: hover) — so the ghost-preview tests, which
// need it to report a real mouse/trackpad, opt in explicitly rather than
// relying on that default the way most other tests here do.
function stubHoverCapable() {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
}

function renderFilters(overrides: Partial<ComponentProps<typeof DanceScheduleFilters>> = {}) {
  const onDateChange = vi.fn()
  const onLevelRangeChange = vi.fn()
  const onShowGcaChange = vi.fn()
  // Derived from the effective (possibly overridden) slots, not a fixed constant —
  // otherwise a test overriding `slots` to a smaller combined-slots array without
  // also overriding these would get a maxPresentLevelIndex one past its end.
  const slots = overrides.slots ?? BASE_SLOTS

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
        minPresentLevelIndex={0}
        maxPresentLevelIndex={slots.length - 1}
        showGca
        onShowGcaChange={onShowGcaChange}
        hasGcaOnSelectedDate
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

  it("formats date options in the viewer's own locale, still pinned to UTC", () => {
    Object.defineProperty(navigator, 'languages', { value: ['fr-FR'], configurable: true })

    renderFilters()

    expect(screen.getByRole('option', { name: 'jeu. 2 juil.' })).toBeInTheDocument()
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

  it('does not activate the ghost preview on a device without real hover (e.g. touch)', () => {
    // Default jsdom matchMedia stub — no stubHoverCapable() here, deliberately,
    // since this is exactly what a touch device's (hover: hover) reports.
    renderFilters()
    const ghosts = document.querySelectorAll('[class*="ghostThumb"]')

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'C1' }))
    for (const ghost of ghosts) {
      expect(ghost).toHaveAttribute('data-active', 'false')
    }
  })

  it('shows a ghost marker on the track only while hovering its tick, and only that one', () => {
    stubHoverCapable()
    renderFilters()
    // BASE_SLOTS is uncombined (one slot per LEVEL_ORDER entry), so ghost marker
    // order matches LEVEL_ORDER order — same index the tick loop above renders in.
    const ghosts = document.querySelectorAll('[class*="ghostThumb"]')
    expect(ghosts).toHaveLength(LEVEL_ORDER.length)
    for (const ghost of ghosts) {
      expect(ghost).toHaveAttribute('data-active', 'false')
    }

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'C1' }))
    expect(ghosts[LEVEL_ORDER.indexOf('C1')]).toHaveAttribute('data-active', 'true')
    // Every other marker stays inactive — hovering one tick doesn't light up others.
    expect(ghosts[LEVEL_ORDER.indexOf('SSD')]).toHaveAttribute('data-active', 'false')

    fireEvent.mouseLeave(screen.getByRole('button', { name: 'C1' }))
    expect(ghosts[LEVEL_ORDER.indexOf('C1')]).toHaveAttribute('data-active', 'false')
  })

  it('shows the nearest ghost marker while hovering the track itself, not just a tick label', () => {
    stubHoverCapable()
    renderFilters()
    const ghosts = document.querySelectorAll('[class*="ghostThumb"]')
    const track = document.querySelector('[class*="sliderTrack"]') as HTMLElement
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 196,
      top: 0,
      height: 4,
      right: 196,
      bottom: 4,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect)

    // usableWidth = 196 - 2*8 = 180; index 5 ("C1") sits at fraction 5/9 of
    // the full 10-slot range -> relativeX = 8 + (5/9)*180 = 108.
    fireEvent.mouseMove(track, { clientX: 108 })
    expect(ghosts[LEVEL_ORDER.indexOf('C1')]).toHaveAttribute('data-active', 'true')

    fireEvent.mouseLeave(track)
    expect(ghosts[LEVEL_ORDER.indexOf('C1')]).toHaveAttribute('data-active', 'false')
  })

  it("shapes the ghost marker to match whichever thumb moveNearestThumb says would actually move", () => {
    stubHoverCapable()
    renderFilters({ minLevelIndex: 0, maxLevelIndex: 2 })
    const ghosts = document.querySelectorAll('[class*="ghostThumb"]')

    // Interior, equidistant from both (0 and 2) — moveNearestThumb's own
    // documented tie-break goes to min.
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'MS' }))
    expect(ghosts[LEVEL_ORDER.indexOf('MS')]).toHaveAttribute('data-thumb', 'min')
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'MS' }))

    // Outside the current range (5 >= max of 2) — moves max, not min.
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'C1' }))
    expect(ghosts[LEVEL_ORDER.indexOf('C1')]).toHaveAttribute('data-thumb', 'max')
  })

  it('shows no ghost marker for the tick already at the current min/max — clicking it is a no-op', () => {
    stubHoverCapable()
    renderFilters({ minLevelIndex: 0, maxLevelIndex: 2 })
    const ghosts = document.querySelectorAll('[class*="ghostThumb"]')

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'SSD' }))
    expect(ghosts[LEVEL_ORDER.indexOf('SSD')]).toHaveAttribute('data-active', 'false')
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'SSD' }))

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Plus' }))
    expect(ghosts[LEVEL_ORDER.indexOf('Plus')]).toHaveAttribute('data-active', 'false')
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

  it('omits the GCA checkbox entirely when the selected date has no GCA sessions', () => {
    renderFilters({ hasGcaOnSelectedDate: false })
    expect(screen.queryByRole('checkbox', { name: /gca callers/i })).not.toBeInTheDocument()
  })

  describe('level-slider onboarding hint', () => {
    function getLevelField() {
      return document.querySelector('[class*="levelField"]') as HTMLElement
    }

    function getHintRing() {
      return document.querySelector('[class*="hintRing"]')
    }

    it('shows the hint balloon and ring by default (a fresh, undismissed device)', () => {
      renderFilters()
      expect(screen.getByText('Tap or drag to filter dance levels')).toBeInTheDocument()
      expect(getLevelField()).toHaveAttribute('data-hint-visible', 'true')
      expect(getHintRing()).toBeInTheDocument()
    })

    it('does not show the hint balloon or ring once already dismissed on a previous launch', () => {
      localStorage.setItem('dance-schedule:hint-dismissed:level-slider', JSON.stringify(true))
      renderFilters()
      expect(screen.queryByText('Tap or drag to filter dance levels')).not.toBeInTheDocument()
      expect(getLevelField()).toHaveAttribute('data-hint-visible', 'false')
      expect(getHintRing()).not.toBeInTheDocument()
    })

    // FirstRunTextSizePrompt.tsx's own modal visually covers this hint
    // entirely on a genuinely fresh mobile device (both are eligible on
    // launch 1), but HintBalloon's global "swallow the very next click"
    // listener doesn't know that — without this suppression, a tap on the
    // modal's own buttons gets eaten before it ever reaches them. See
    // docs/design/onboarding-hints.md.
    it('suppresses the level-slider hint while the first-run text-size prompt would be showing (mobile, launch 1)', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList)

      renderFilters()

      expect(screen.queryByText('Tap or drag to filter dance levels')).not.toBeInTheDocument()
      expect(getLevelField()).toHaveAttribute('data-hint-visible', 'false')
      expect(getHintRing()).not.toBeInTheDocument()
    })

    it('does NOT suppress the level-slider hint at a non-mobile width, even on launch 1', () => {
      renderFilters()
      expect(screen.getByText('Tap or drag to filter dance levels')).toBeInTheDocument()
    })

    // Regression test for the same class of bug fixed in PageMenu.test.tsx's
    // own "un-suppresses ... once the text-size prompt is dismissed from
    // elsewhere, live" test: this suppression check holds a READ-ONLY
    // useFirstLaunchHint('text-size', 1) instance, while
    // FirstRunTextSizePrompt.tsx is the one that actually calls dismiss() on
    // that same id, from a separate component instance. Confirms
    // useFirstLaunchHint.ts's useSyncExternalStore fix applies equally here,
    // not just for the kebab-menu hint it was originally diagnosed against.
    function TextSizePromptStandIn() {
      const { dismiss } = useFirstLaunchHint('text-size', 1)
      return (
        <button type="button" onClick={dismiss}>
          Simulate picking a text size
        </button>
      )
    }

    it('un-suppresses the level-slider hint once the text-size prompt is dismissed from elsewhere, live', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList)
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
            minPresentLevelIndex={0}
            maxPresentLevelIndex={BASE_SLOTS.length - 1}
            showGca
            onShowGcaChange={onShowGcaChange}
            hasGcaOnSelectedDate
          />
          <TextSizePromptStandIn />
        </TextSizeProvider>,
      )
      expect(screen.queryByText('Tap or drag to filter dance levels')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Simulate picking a text size' }))

      expect(screen.getByText('Tap or drag to filter dance levels')).toBeInTheDocument()
    })

    it('dismisses the hint when a tick is clicked', () => {
      renderFilters({ minLevelIndex: 0, maxLevelIndex: 2 })
      fireEvent.click(screen.getByRole('button', { name: 'C1' }))

      expect(screen.queryByText('Tap or drag to filter dance levels')).not.toBeInTheDocument()
      expect(getLevelField()).toHaveAttribute('data-hint-visible', 'false')
      expect(getHintRing()).not.toBeInTheDocument()
      expect(localStorage.getItem('dance-schedule:hint-dismissed:level-slider')).toBe(
        JSON.stringify(true),
      )
    })

    // The test above dispatches a bare `click`, with no preceding
    // `pointerdown` — it exercises the tick's own onClick wiring, but not
    // whether a REAL tap (pointerdown, then click) gets swallowed on its
    // first hit. `HintBalloon` no longer exempts this field's own real
    // target (ticks/thumbs) from that swallow — per direct product
    // decision, tapping a tick while the hint is showing should behave
    // like every other first tap: dismiss only, not also change the level
    // range — matching PageMenu.tsx's own toggle. A real pointerdown+click
    // pair (not `userEvent.click()`, which this file doesn't otherwise
    // use) is what actually exercises HintBalloon's own swallow mechanism.
    it('does NOT change the level range on that same first tap — only a second, deliberate tap does', () => {
      const { onLevelRangeChange } = renderFilters({ minLevelIndex: 0, maxLevelIndex: 2 })
      const tick = screen.getByRole('button', { name: 'C1' })

      fireEvent.pointerDown(tick)
      fireEvent.click(tick)

      expect(onLevelRangeChange).not.toHaveBeenCalled()
      expect(getLevelField()).toHaveAttribute('data-hint-visible', 'false')

      fireEvent.pointerDown(tick)
      fireEvent.click(tick)

      expect(onLevelRangeChange).toHaveBeenCalledTimes(1)
    })

    it('dismisses the hint when a thumb is dragged (moved with the keyboard)', () => {
      renderFilters({ minLevelIndex: 2, maxLevelIndex: 7 })
      const [minThumb] = screen.getAllByRole('slider')
      minThumb!.focus()
      fireEvent.keyDown(minThumb!, { key: 'ArrowRight' })

      expect(screen.queryByText('Tap or drag to filter dance levels')).not.toBeInTheDocument()
      expect(getLevelField()).toHaveAttribute('data-hint-visible', 'false')
      expect(getHintRing()).not.toBeInTheDocument()
    })
  })

  describe('out-of-range tick styling', () => {
    it('marks ticks inside the selected range as in-range, and ticks outside it as not', () => {
      renderFilters({ minLevelIndex: 2, maxLevelIndex: 5 })

      expect(screen.getByRole('button', { name: LEVEL_ORDER[1]! })).toHaveAttribute('data-in-range', 'false')
      expect(screen.getByRole('button', { name: LEVEL_ORDER[2]! })).toHaveAttribute('data-in-range', 'true')
      expect(screen.getByRole('button', { name: LEVEL_ORDER[5]! })).toHaveAttribute('data-in-range', 'true')
      expect(screen.getByRole('button', { name: LEVEL_ORDER[6]! })).toHaveAttribute('data-in-range', 'false')
    })

    it('marks every present tick in-range when the selection spans the full present range', () => {
      renderFilters()

      for (const level of LEVEL_ORDER) {
        expect(screen.getByRole('button', { name: level })).toHaveAttribute('data-in-range', 'true')
      }
    })
  })

  describe('with a present-level range narrower than the full slots', () => {
    it('renders ticks only for slots within [minPresentLevelIndex, maxPresentLevelIndex]', () => {
      renderFilters({ minPresentLevelIndex: 2, maxPresentLevelIndex: 5 })
      const expectedLabels = BASE_SLOTS.slice(2, 6).map((slot) => slot.label)
      expect(screen.getAllByRole('button', { name: /./ })).toHaveLength(expectedLabels.length)
      for (const label of expectedLabels) {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
      }
      expect(screen.queryByRole('button', { name: 'SSD' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'C4' })).not.toBeInTheDocument()
    })

    it('narrows the slider\'s own min/max to the present range, not the full slots range', () => {
      renderFilters({ minPresentLevelIndex: 2, maxPresentLevelIndex: 5, minLevelIndex: 2, maxLevelIndex: 5 })
      const [minThumb, maxThumb] = screen.getAllByRole('slider')
      expect(minThumb).toHaveAttribute('aria-valuemin', '2')
      expect(maxThumb).toHaveAttribute('aria-valuemax', '5')
    })
  })
})
