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

  // Regression test for a real-device-only bug: TWO earlier versions of
  // the swallow mechanism both raced against a clock (first a
  // `setTimeout(fn, 0)` cleanup, then a wider fixed timeout +
  // `pointercancel` fast-path) — both failed live, on an actual device,
  // where a real tap's own 'click' doesn't follow 'pointerdown' on any
  // timeline a fixed window can safely assume (real finger dwell time,
  // mobile tap-delay, and `pointercancel` firing on ordinary finger
  // jitter all vary in ways no synthetic/automated click ever exercises).
  // The actual fix (see HintBalloon.tsx's own comment) drops the clock
  // entirely — swallow state is a flag, consumed whenever the click
  // actually shows up, however long that takes. Uses `fireEvent` directly
  // (not `userEvent.click()`, which fires its own events back-to-back with
  // no way to insert a delay) plus a long fake-timer advance to prove
  // there's no hidden deadline left to race against.
  it('still swallows the click no matter how long it takes to arrive after pointerdown', () => {
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

      // Comfortably longer than any fixed window a previous version of
      // this mechanism ever used — the point is that NO duration should
      // matter anymore.
      vi.advanceTimersByTime(10_000)
      fireEvent.click(outside)

      expect(outsideOnClick).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // The flip side of dropping the clock: an ABANDONED gesture (pointerdown
  // with no click ever following — e.g. it turned into a scroll) must not
  // leave a stale "swallow" decision sitting around to incorrectly eat
  // some LATER, unrelated tap's own click. Guarded against here not by a
  // timeout, but by every new qualifying pointerdown overwriting the
  // shared flag fresh — so a real target's own legitimate tap still goes
  // through even after an earlier, abandoned outside tap.
  it('a later pointerdown supersedes a stale pending swallow left by an earlier, abandoned gesture', () => {
    const onDismiss = vi.fn()
    const outsideOnClick = vi.fn()
    const targetOnClick = vi.fn()
    function Wrapper() {
      const targetRef = useRef<HTMLButtonElement>(null)
      return (
        <div>
          <button type="button" onClick={outsideOnClick}>
            Outside
          </button>
          <button type="button" ref={targetRef} onClick={targetOnClick}>
            Real target
          </button>
          <HintBalloon message="Tap here for the menu" onDismiss={onDismiss} targetRef={targetRef} />
        </div>
      )
    }
    render(<Wrapper />)

    // Abandoned gesture: pointerdown on an "outside" element, but no click
    // ever follows it (simulating a tap that turned into a scroll).
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))

    // A later, real tap on the REAL target — its own pointerdown should
    // overwrite the stale pending-swallow state above, not inherit it.
    const target = screen.getByRole('button', { name: 'Real target' })
    fireEvent.pointerDown(target)
    fireEvent.click(target)

    expect(targetOnClick).toHaveBeenCalledTimes(1)
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
