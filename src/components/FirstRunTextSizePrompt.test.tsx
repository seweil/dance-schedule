import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FirstRunTextSizePrompt } from './FirstRunTextSizePrompt'
import { TextSizeProvider } from './TextSizeProvider'

const LAUNCH_COUNT_KEY = 'dance-schedule:launch-count'
const DISMISSED_KEY = 'dance-schedule:hint-dismissed:text-size'
const TEXT_SIZE_KEY = 'dance-schedule:text-size'

function seedLaunchCount(count: number) {
  localStorage.setItem(LAUNCH_COUNT_KEY, JSON.stringify(count))
}

// jsdom's default matchMedia stub (test-setup.ts) never matches — same
// "no match" default RotateDeviceBanner.test.tsx's own mockPortraitPhone()
// comment describes — so every test below that expects the prompt to
// actually render needs to explicitly mock a mobile-width match first.
function mockMobileViewport() {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList)
}

function renderPrompt() {
  return render(
    <TextSizeProvider>
      <FirstRunTextSizePrompt />
    </TextSizeProvider>,
  )
}

describe('FirstRunTextSizePrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-text-size')
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-text-size')
    vi.restoreAllMocks()
  })

  it('does not render at a non-mobile (desktop) width', () => {
    seedLaunchCount(1)
    renderPrompt()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders on a fresh device (launch 1, not dismissed, mobile width)', () => {
    seedLaunchCount(1)
    mockMobileViewport()
    renderPrompt()
    expect(screen.getByRole('dialog', { name: 'Make text easier to read?' })).toBeInTheDocument()
  })

  it('does not render once already dismissed', () => {
    seedLaunchCount(1)
    mockMobileViewport()
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(true))
    renderPrompt()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not render past the first launch', () => {
    seedLaunchCount(2)
    mockMobileViewport()
    renderPrompt()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('selecting a size applies it and dismisses the prompt', async () => {
    seedLaunchCount(1)
    mockMobileViewport()
    const user = userEvent.setup()
    renderPrompt()

    await user.click(screen.getByRole('button', { name: 'Large' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.documentElement.dataset.textSize).toBe('large')
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true')
    expect(localStorage.getItem(TEXT_SIZE_KEY)).toBe(JSON.stringify('large'))
  })

  // No separate "keep default" button — "Normal" among TextSizeControl's own
  // three options already IS the default, so clicking it is how a fresh
  // visitor explicitly keeps the default (see the component's own comment).
  it('picking "Normal" dismisses without changing the (already-default) preference', async () => {
    seedLaunchCount(1)
    mockMobileViewport()
    const user = userEvent.setup()
    renderPrompt()

    await user.click(screen.getByRole('button', { name: 'Normal' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.documentElement.dataset.textSize).toBeUndefined()
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true')
  })

  it('dismisses on a backdrop click', () => {
    seedLaunchCount(1)
    mockMobileViewport()
    const { container } = renderPrompt()

    fireEvent.click(container.firstChild as Element)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not dismiss when clicking inside the dialog card', async () => {
    seedLaunchCount(1)
    mockMobileViewport()
    const user = userEvent.setup()
    renderPrompt()

    await user.click(screen.getByText('Make text easier to read?'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('dismisses on Escape', () => {
    seedLaunchCount(1)
    mockMobileViewport()
    renderPrompt()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
