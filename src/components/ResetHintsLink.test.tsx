import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetHintsLink } from './ResetHintsLink'
import { resetAppState } from '../lib/resetAppState'

vi.mock('../lib/resetAppState', () => ({ resetAppState: vi.fn() }))

describe('ResetHintsLink', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  // Runs the same resetAppState() as ClearStorageAction.tsx/ResetAction.tsx —
  // see that module's own comment for why all three share one "reset"
  // definition now, rather than this button hand-rolling its own narrower
  // clearAllStorage() + plain reload.
  it('runs resetAppState once clicked', async () => {
    const user = userEvent.setup()

    render(<ResetHintsLink />)
    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(resetAppState).toHaveBeenCalledTimes(1)
  })

  it('disables the button and shows "Resetting…" once clicked, so a slow reset does not look broken', async () => {
    const user = userEvent.setup()

    render(<ResetHintsLink />)
    await user.click(screen.getByRole('button', { name: 'Reset' }))

    const button = screen.getByRole('button', { name: /resetting/i })
    expect(button).toBeDisabled()
  })
})
