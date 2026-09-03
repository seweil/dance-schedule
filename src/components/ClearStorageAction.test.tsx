import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ClearStorageAction } from './ClearStorageAction'
import { TextSizeProvider } from './TextSizeProvider'
import { resetAppState } from '../lib/resetAppState'

vi.mock('../lib/resetAppState', () => ({ resetAppState: vi.fn() }))

function renderAction() {
  return render(
    <MemoryRouter>
      <TextSizeProvider>
        <ClearStorageAction />
      </TextSizeProvider>
    </MemoryRouter>,
  )
}

describe('ClearStorageAction', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('does not reset anything just from being rendered', () => {
    renderAction()
    expect(resetAppState).not.toHaveBeenCalled()
  })

  it('runs resetAppState once the button is clicked', async () => {
    const user = userEvent.setup()
    // On a fresh device (this file's own test-setup.ts clears localStorage
    // after every test), PageHeader's own PageMenu would otherwise show its
    // kebab-menu onboarding hint — and per HintBalloon.tsx's own comment,
    // the very first tap anywhere OTHER than that hint's own real target
    // now dismisses the hint but swallows its own click, so THIS test's own
    // button click wouldn't reach the button's handler at all. Pre-dismissing
    // it here isolates this test's own actual behavior from that separate
    // concern, the same way RotateDeviceBanner.test.tsx's own tests already
    // have to.
    localStorage.setItem('dance-schedule:hint-dismissed:kebab-menu', JSON.stringify(true))
    renderAction()

    await user.click(screen.getByRole('button', { name: /clear saved settings/i }))

    expect(resetAppState).toHaveBeenCalledTimes(1)
  })

  it('disables the button and shows "Resetting…" once clicked, so a slow reset does not look broken', async () => {
    const user = userEvent.setup()
    localStorage.setItem('dance-schedule:hint-dismissed:kebab-menu', JSON.stringify(true))
    renderAction()

    await user.click(screen.getByRole('button', { name: /clear saved settings/i }))

    const button = screen.getByRole('button', { name: /resetting/i })
    expect(button).toBeDisabled()
  })
})
