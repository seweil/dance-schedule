import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { useSyncedGridScroll } from './useSyncedGridScroll'

function Harness({ resetKey, showBody = true }: { resetKey: unknown; showBody?: boolean }) {
  const { headerRef, setBodyRef } = useSyncedGridScroll(resetKey)
  return (
    <div>
      <div data-testid="header" ref={headerRef} />
      {showBody && <div data-testid="body" ref={setBodyRef} />}
    </div>
  )
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
})
