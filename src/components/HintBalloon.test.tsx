import { createRef, useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HintBalloon } from './HintBalloon'

// A no-op ref for tests that don't care about the "tap on the real target"
// exemption — never actually attached to any rendered element, so
// targetRef.current stays null and every tap in these tests is treated as
// "outside" (the same as a real caller's target ref before that element has
// mounted).
function unattachedTargetRef() {
  return createRef<HTMLElement>()
}

describe('HintBalloon', () => {
  it('renders the given message', () => {
    render(<HintBalloon message="Tap here for the menu" onDismiss={vi.fn()} targetRef={unattachedTargetRef()} />)
    expect(screen.getByText('Tap here for the menu')).toBeInTheDocument()
  })

  it('calls onDismiss when clicking anywhere outside the balloon', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(
      <div>
        <HintBalloon message="Tap here for the menu" onDismiss={onDismiss} targetRef={unattachedTargetRef()} />
        <button type="button">Outside</button>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Outside' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not call onDismiss when clicking inside the balloon (its own message text)', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(<HintBalloon message="Tap here for the menu" onDismiss={onDismiss} targetRef={unattachedTargetRef()} />)

    await user.click(screen.getByText('Tap here for the menu'))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('defaults to "end" placement when none is given', () => {
    render(<HintBalloon message="Tap here for the menu" onDismiss={vi.fn()} targetRef={unattachedTargetRef()} />)
    expect(screen.getByRole('status')).toHaveAttribute('data-placement', 'end')
  })

  it('renders "center" placement when requested', () => {
    render(
      <HintBalloon
        message="Tap or drag to filter dance levels"
        onDismiss={vi.fn()}
        placement="center"
        targetRef={unattachedTargetRef()}
      />,
    )
    expect(screen.getByRole('status')).toHaveAttribute('data-placement', 'center')
  })

  // The actual first-launch problem this pair of tests guards against: a new
  // user's very first tap, wherever it lands, shouldn't ALSO navigate them
  // away from (e.g.) the home page they haven't read yet — see
  // HintBalloon.tsx's own handlePointerDown comment.
  it('dismisses but swallows the click on an outside element that is not the real target', async () => {
    const onDismiss = vi.fn()
    const outsideOnClick = vi.fn()
    const user = userEvent.setup()
    render(
      <div>
        <HintBalloon message="Tap here for the menu" onDismiss={onDismiss} targetRef={unattachedTargetRef()} />
        <button type="button" onClick={outsideOnClick}>
          Outside
        </button>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Outside' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(outsideOnClick).not.toHaveBeenCalled()
  })

  // Regression test for a real-device-only bug: an earlier version cleaned
  // up the swallow listener via `setTimeout(fn, 0)`, which fires well
  // before a REAL tap's own 'click' arrives (a physical finger's own
  // touchstart-to-touchend dwell time, plus some mobile browsers' own tap
  // delay, both add real elapsed time that userEvent.click()'s effectively
  // back-to-back events never exercise) — reported live as the menu still
  // opening on a real device despite this working in every desktop/
  // automated test. Uses fireEvent + fake timers directly (not
  // userEvent.click(), which doesn't allow inserting a delay between its
  // own pointerdown and click) to simulate that real-world gap.
  it('still swallows the click if it arrives with a real-world delay after pointerdown', () => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const outsideOnClick = vi.fn()
      render(
        <div>
          <HintBalloon message="Tap here for the menu" onDismiss={onDismiss} targetRef={unattachedTargetRef()} />
          <button type="button" onClick={outsideOnClick}>
            Outside
          </button>
        </div>,
      )
      const outside = screen.getByRole('button', { name: 'Outside' })

      fireEvent.pointerDown(outside)
      expect(onDismiss).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(200)
      fireEvent.click(outside)

      expect(outsideOnClick).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops swallowing once the cleanup window fully elapses with no click at all (e.g. the pointerdown became a scroll, not a tap)', () => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const outsideOnClick = vi.fn()
      render(
        <div>
          <HintBalloon message="Tap here for the menu" onDismiss={onDismiss} targetRef={unattachedTargetRef()} />
          <button type="button" onClick={outsideOnClick}>
            Outside
          </button>
        </div>,
      )
      const outside = screen.getByRole('button', { name: 'Outside' })

      fireEvent.pointerDown(outside)
      vi.advanceTimersByTime(600)
      fireEvent.click(outside)

      expect(outsideOnClick).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('dismisses without swallowing the click when tapping the real target', async () => {
    const onDismiss = vi.fn()
    const targetOnClick = vi.fn()
    const user = userEvent.setup()
    function Wrapper() {
      const targetRef = useRef<HTMLButtonElement>(null)
      return (
        <div>
          <button type="button" ref={targetRef} onClick={targetOnClick}>
            Real target
          </button>
          <HintBalloon message="Tap here for the menu" onDismiss={onDismiss} targetRef={targetRef} />
        </div>
      )
    }

    render(<Wrapper />)

    await user.click(screen.getByRole('button', { name: 'Real target' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(targetOnClick).toHaveBeenCalledTimes(1)
  })
})
