import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { useSyncedGridScroll } from './useSyncedGridScroll'

function Harness({
  resetKey,
  showBody = true,
  panelOverflowX = 'auto',
}: {
  resetKey: unknown
  showBody?: boolean
  panelOverflowX?: 'auto' | 'visible'
}) {
  const { panelRef, headerRef, setBodyRef } = useSyncedGridScroll(resetKey)
  return (
    <div>
      <div data-testid="panel" ref={panelRef} style={{ overflowX: panelOverflowX }} />
      <div data-testid="header" ref={headerRef} />
      {showBody && <div data-testid="body" ref={setBodyRef} />}
    </div>
  )
}

// scrollWidth/clientWidth are always 0 in jsdom (no real layout) — stub them per
// element the way tests elsewhere in this repo fake scroll geometry.
function mockScrollMetrics(el: HTMLElement, { scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
}

describe('useSyncedGridScroll', () => {
  it("mirrors the body's scroll position onto the header on scroll", () => {
    const { getByTestId } = render(<Harness resetKey="a" />)
    const header = getByTestId('header') as HTMLDivElement
    const body = getByTestId('body') as HTMLDivElement

    body.scrollLeft = 42
    fireEvent.scroll(body)

    expect(header.scrollLeft).toBe(42)
  })

  it('resets both scroll positions to 0 when resetKey changes', () => {
    const { getByTestId, rerender } = render(<Harness resetKey="a" />)
    const header = getByTestId('header') as HTMLDivElement
    const body = getByTestId('body') as HTMLDivElement
    header.scrollLeft = 50
    body.scrollLeft = 50

    rerender(<Harness resetKey="b" />)

    expect(header.scrollLeft).toBe(0)
    expect(body.scrollLeft).toBe(0)
  })

  it('does not reset scroll position when resetKey is unchanged across a re-render', () => {
    const { getByTestId, rerender } = render(<Harness resetKey="a" />)
    const header = getByTestId('header') as HTMLDivElement
    header.scrollLeft = 50

    rerender(<Harness resetKey="a" />)

    expect(header.scrollLeft).toBe(50)
  })

  it('re-attaches the scroll listener when the body node remounts', () => {
    // setBodyRef is a callback ref, not a mount-only effect, specifically so a body
    // element that unmounts and remounts (e.g. the empty-filter-results branch a
    // consuming grid renders instead) still gets its scroll listener re-attached —
    // see the hook's own comment.
    const { getByTestId, rerender } = render(<Harness resetKey="a" showBody={false} />)
    rerender(<Harness resetKey="a" showBody />)

    const header = getByTestId('header') as HTMLDivElement
    const body = getByTestId('body') as HTMLDivElement
    body.scrollLeft = 17
    fireEvent.scroll(body)

    expect(header.scrollLeft).toBe(17)
  })

  it('flags both scroll edges on panelWrapper when it is the scrolling element (desktop)', () => {
    const { getByTestId } = render(<Harness resetKey="a" panelOverflowX="auto" />)
    const panel = getByTestId('panel') as HTMLDivElement
    mockScrollMetrics(panel, { scrollWidth: 1000, clientWidth: 400 })

    fireEvent.scroll(panel)
    expect(panel.dataset.canScrollLeft).toBe('false')
    expect(panel.dataset.canScrollRight).toBe('true')

    panel.scrollLeft = 600
    fireEvent.scroll(panel)
    expect(panel.dataset.canScrollLeft).toBe('true')
    expect(panel.dataset.canScrollRight).toBe('false')
  })

  it('reads scroll edges off bodyWrapper instead, but still flags them on panelWrapper (mobile)', () => {
    const { getByTestId } = render(<Harness resetKey="a" panelOverflowX="visible" />)
    const panel = getByTestId('panel') as HTMLDivElement
    const body = getByTestId('body') as HTMLDivElement
    mockScrollMetrics(body, { scrollWidth: 1000, clientWidth: 400 })

    fireEvent.scroll(body)

    expect(panel.dataset.canScrollLeft).toBe('false')
    expect(panel.dataset.canScrollRight).toBe('true')
  })

  it('clears both scroll-edge flags when resetKey changes to a set of columns that fits', () => {
    const { getByTestId, rerender } = render(<Harness resetKey="a" panelOverflowX="auto" />)
    const panel = getByTestId('panel') as HTMLDivElement
    mockScrollMetrics(panel, { scrollWidth: 1000, clientWidth: 400 })
    fireEvent.scroll(panel)
    expect(panel.dataset.canScrollRight).toBe('true')

    mockScrollMetrics(panel, { scrollWidth: 400, clientWidth: 400 })
    rerender(<Harness resetKey="b" panelOverflowX="auto" />)

    expect(panel.dataset.canScrollLeft).toBe('false')
    expect(panel.dataset.canScrollRight).toBe('false')
  })
})
