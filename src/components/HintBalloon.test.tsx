import { createRef, useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
