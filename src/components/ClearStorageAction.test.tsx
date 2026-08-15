import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ClearStorageAction } from './ClearStorageAction'
import { TextSizeProvider } from './TextSizeProvider'

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
  it('does not clear localStorage just from being rendered', () => {
    localStorage.setItem('some-key', 'some-value')
    renderAction()
    expect(localStorage.getItem('some-key')).toBe('some-value')
  })

  it('clears localStorage and shows a confirmation once the button is clicked', async () => {
    const user = userEvent.setup()
    localStorage.setItem('some-key', 'some-value')
    // On a fresh device (this file's own test-setup.ts clears localStorage
    // after every test), PageHeader's own PageMenu would otherwise show its
    // kebab-menu onboarding hint — and per HintBalloon.tsx's own comment,
    // the very first tap anywhere OTHER than that hint's own real target
    // now dismisses the hint but swallows its own click, so THIS test's own
    // button click wouldn't reach ClearStorageAction's handler at all.
    // Pre-dismissing it here isolates this test's own actual behavior from
    // that separate concern, the same way RotateDeviceBanner.test.tsx's own
    // tests already have to.
    localStorage.setItem('dance-schedule:hint-dismissed:kebab-menu', JSON.stringify(true))
    renderAction()

    await user.click(screen.getByRole('button', { name: /clear saved settings/i }))

    expect(localStorage.getItem('some-key')).toBeNull()
    expect(screen.getByText(/have all been cleared/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/')
  })
})
