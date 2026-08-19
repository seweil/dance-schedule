import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { resetLaunchCountGuardForTests, useAppLaunchCount } from './useAppLaunchCount'

const STORAGE_KEY = 'dance-schedule:launch-count'

function TestHarness() {
  const count = useAppLaunchCount()
  return <div data-testid="count">{count}</div>
}

describe('useAppLaunchCount', () => {
  // The hook's own module-level double-invoke guard (see its comment) means
  // it only increments once per "page load" — resetLaunchCountGuardForTests
  // simulates a fresh one for each test, the same way each of these tests
  // already gets a fresh localStorage via setup.
  beforeEach(() => {
    resetLaunchCountGuardForTests()
  })

  it('starts at 1 and persists it when nothing is stored', () => {
    render(<TestHarness />)
    expect(screen.getByTestId('count')).toHaveTextContent('1')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(1))
  })

  it('increments a previously stored count by one', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(2))
    render(<TestHarness />)
    expect(screen.getByTestId('count')).toHaveTextContent('3')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(3))
  })

  it('falls back to 0 (incrementing to 1) when the stored value is not a valid number', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('not-a-number'))
    render(<TestHarness />)
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('falls back to 0 (incrementing to 1) when the stored value is malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    render(<TestHarness />)
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })
})
