import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFirstLaunchHint } from './useFirstLaunchHint'

const LAUNCH_COUNT_KEY = 'dance-schedule:launch-count'
const dismissedKey = (id: string) => `dance-schedule:hint-dismissed:${id}`

function TestHarness({ id, maxLaunches }: { id: string; maxLaunches?: number }) {
  const { shouldShow, dismiss } = useFirstLaunchHint(id, maxLaunches)
  return (
    <div>
      <div data-testid="should-show">{String(shouldShow)}</div>
      <button type="button" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  )
}

describe('useFirstLaunchHint', () => {
  it('shows by default (launch count 0, well within the default 3-launch window)', () => {
    render(<TestHarness id="kebab-menu" />)
    expect(screen.getByTestId('should-show')).toHaveTextContent('true')
  })

  it('still shows exactly at the maxLaunches boundary', () => {
    localStorage.setItem(LAUNCH_COUNT_KEY, JSON.stringify(3))
    render(<TestHarness id="kebab-menu" />)
    expect(screen.getByTestId('should-show')).toHaveTextContent('true')
  })

  it('stops showing once the launch count exceeds maxLaunches', () => {
    localStorage.setItem(LAUNCH_COUNT_KEY, JSON.stringify(4))
    render(<TestHarness id="kebab-menu" />)
    expect(screen.getByTestId('should-show')).toHaveTextContent('false')
  })

  it('respects a custom maxLaunches', () => {
    localStorage.setItem(LAUNCH_COUNT_KEY, JSON.stringify(5))
    render(<TestHarness id="kebab-menu" maxLaunches={10} />)
    expect(screen.getByTestId('should-show')).toHaveTextContent('true')
  })

  it('never shows once already dismissed, regardless of launch count', () => {
    localStorage.setItem(dismissedKey('kebab-menu'), JSON.stringify(true))
    render(<TestHarness id="kebab-menu" />)
    expect(screen.getByTestId('should-show')).toHaveTextContent('false')
  })

  it('dismissing hides it immediately and persists the dismissal', async () => {
    const user = userEvent.setup()
    render(<TestHarness id="kebab-menu" />)
    expect(screen.getByTestId('should-show')).toHaveTextContent('true')

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.getByTestId('should-show')).toHaveTextContent('false')
    expect(localStorage.getItem(dismissedKey('kebab-menu'))).toBe(JSON.stringify(true))
  })

  it('keys dismissal by id, so a different hint is unaffected by another one being dismissed', () => {
    localStorage.setItem(dismissedKey('kebab-menu'), JSON.stringify(true))
    render(<TestHarness id="some-other-hint" />)
    expect(screen.getByTestId('should-show')).toHaveTextContent('true')
  })

  // Regression test: FirstRunTextSizePrompt.tsx OWNS useFirstLaunchHint('text-size', 1)
  // (calls dismiss()), while PageMenu.tsx/DanceScheduleFilters.tsx each hold
  // their own READ-ONLY instance of the same id to suppress their own hints
  // while that modal is visible. A private useState per call site (this
  // hook's earlier implementation) meant dismissing from one instance never
  // updated any OTHER instance's own copy of shouldShow — reported live as
  // "the kebab-menu hint never reappears after picking a text size."
  it('a dismiss() from one instance updates shouldShow in every other mounted instance sharing the same id', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <TestHarness id="shared-id" />
        <TestHarness id="shared-id" />
      </div>,
    )
    const [firstShouldShow, secondShouldShow] = screen.getAllByTestId('should-show')
    const [firstDismissButton] = screen.getAllByRole('button', { name: 'Dismiss' })
    expect(firstShouldShow).toHaveTextContent('true')
    expect(secondShouldShow).toHaveTextContent('true')

    await user.click(firstDismissButton!)

    expect(firstShouldShow).toHaveTextContent('false')
    expect(secondShouldShow).toHaveTextContent('false')
  })
})
