import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HintBalloon } from './HintBalloon'

describe('HintBalloon', () => {
  it('renders the given message', () => {
    render(<HintBalloon message="Tap here for the menu" onDismiss={vi.fn()} />)
    expect(screen.getByText('Tap here for the menu')).toBeInTheDocument()
  })

  it('calls onDismiss when the dismiss button is clicked', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(<HintBalloon message="Tap here for the menu" onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss when clicking anywhere outside the balloon', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(
      <div>
        <HintBalloon message="Tap here for the menu" onDismiss={onDismiss} />
        <button type="button">Outside</button>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Outside' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not call onDismiss when clicking inside the balloon (its own message text)', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(<HintBalloon message="Tap here for the menu" onDismiss={onDismiss} />)

    await user.click(screen.getByText('Tap here for the menu'))

    expect(onDismiss).not.toHaveBeenCalled()
  })
})
