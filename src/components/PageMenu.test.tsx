import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useFirstLaunchHint } from '../hooks/useFirstLaunchHint'
import { PageMenu } from './PageMenu'
import { TextSizeProvider } from './TextSizeProvider'

// A few tests below mock window.matchMedia (to simulate a mobile viewport
// for the first-run text-size prompt suppression check) — restoring it
// afterward keeps that from leaking into other tests, which rely on the
// default "no match" stub (test-setup.ts) the same way
// RotateDeviceBanner.test.tsx's own mockPortraitPhone() comment describes.
afterEach(() => {
  vi.restoreAllMocks()
})

// The toggle is only visible below the CSS module's mobile breakpoint. Real CSS is
// loaded in jsdom (vitest.config.ts sets css: true), and per the accname spec a
// display:none element's aria-label doesn't resolve to an accessible name at all —
// so without this mock, the toggle would be unqueryable by role/name in every test.
// These tests cover ARIA/interaction state, not the responsive CSS switch itself
// (that's covered in Playwright instead).
vi.mock('./PageMenu.module.css', () => ({
  default: { nav: 'nav', toggle: 'toggle', list: 'list', link: 'link' } satisfies Record<
    string,
    string
  >,
}))

function getToggle() {
  return screen.getByRole('button', { name: /menu/i })
}

// The toggle deliberately gets no exemption from HintBalloon's "first tap
// swallows its own click" behavior (see HintBalloon.tsx's own targetRef
// comment and this file's own "does NOT open the menu..." test below) — so
// on a fresh test device (default localStorage), a test exercising the
// toggle's own open/close behavior, rather than the hint itself, needs the
// hint pre-dismissed first or its own first click would just dismiss the
// hint instead of opening the menu.
function dismissKebabHint() {
  localStorage.setItem('dance-schedule:hint-dismissed:kebab-menu', JSON.stringify(true))
}

function renderPageMenu(initialPath = '/installation') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TextSizeProvider>
        <PageMenu />
      </TextSizeProvider>
    </MemoryRouter>,
  )
}

describe('PageMenu', () => {
  it('renders a toggle button that controls the link list', () => {
    renderPageMenu()
    const toggle = getToggle()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', screen.getByRole('list').id)
  })

  it('opens and closes the menu when the toggle is clicked', async () => {
    dismissKebabHint()
    const user = userEvent.setup()
    renderPageMenu()
    const toggle = getToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the menu when Escape is pressed', async () => {
    dismissKebabHint()
    const user = userEvent.setup()
    renderPageMenu()
    const toggle = getToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it("marks the current page's link with aria-current, and no other", () => {
    renderPageMenu('/installation')
    expect(screen.getByRole('link', { name: /installation/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /features/i })).not.toHaveAttribute('aria-current')
  })

  it('marks only the Dance Schedule link as emphasized', () => {
    renderPageMenu()
    expect(screen.getByRole('link', { name: /^dance schedule$/i })).toHaveAttribute(
      'data-emphasized',
      'true',
    )
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('data-emphasized', 'false')
    expect(screen.getByRole('link', { name: /room schedule/i })).toHaveAttribute(
      'data-emphasized',
      'false',
    )
  })

  it('closes the menu when a text-size option is selected, same as clicking a page link would', async () => {
    dismissKebabHint()
    const user = userEvent.setup()
    renderPageMenu()
    const toggle = getToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: 'Large' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the kebab-menu hint balloon by default (a fresh, undismissed device)', () => {
    renderPageMenu()
    expect(screen.getByText('Tap here for menu')).toBeInTheDocument()
    expect(getToggle()).toHaveAttribute('data-hint-visible', 'true')
  })

  it('dismisses the hint balloon when the toggle itself is clicked', async () => {
    const user = userEvent.setup()
    renderPageMenu()
    expect(screen.getByText('Tap here for menu')).toBeInTheDocument()

    await user.click(getToggle())

    expect(screen.queryByText('Tap here for menu')).not.toBeInTheDocument()
    expect(getToggle()).toHaveAttribute('data-hint-visible', 'false')
    expect(localStorage.getItem('dance-schedule:hint-dismissed:kebab-menu')).toBe(
      JSON.stringify(true),
    )
  })

  it('does NOT open the menu on that same first click — only a second, deliberate click does', async () => {
    // Per direct product decision, the toggle gets no exemption from
    // HintBalloon's "first tap swallows its own click" behavior (see
    // HintBalloon.tsx's own targetRef comment) — tapping it while the hint
    // is showing should read the same as tapping anywhere else.
    const user = userEvent.setup()
    renderPageMenu()
    const toggle = getToggle()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)

    expect(screen.queryByText('Tap here for menu')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('does not show the hint balloon once already dismissed on a previous launch', () => {
    localStorage.setItem('dance-schedule:hint-dismissed:kebab-menu', JSON.stringify(true))
    renderPageMenu()
    expect(screen.queryByText('Tap here for menu')).not.toBeInTheDocument()
    expect(getToggle()).toHaveAttribute('data-hint-visible', 'false')
  })

  // FirstRunTextSizePrompt.tsx's own modal visually covers this hint entirely
  // on a genuinely fresh mobile device (both are eligible on launch 1), but
  // HintBalloon's global "swallow the very next click" listener doesn't know
  // that — without this suppression, a tap on the modal's own buttons gets
  // eaten before it ever reaches them. See docs/design/onboarding-hints.md.
  it('suppresses the kebab-menu hint while the first-run text-size prompt would be showing (mobile, launch 1)', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)

    renderPageMenu()

    expect(screen.queryByText('Tap here for menu')).not.toBeInTheDocument()
    expect(getToggle()).toHaveAttribute('data-hint-visible', 'false')
  })

  it('does NOT suppress the kebab-menu hint at a non-mobile width, even on launch 1', () => {
    renderPageMenu()
    expect(screen.getByText('Tap here for menu')).toBeInTheDocument()
  })

  it('does NOT suppress the kebab-menu hint on mobile once the text-size prompt is dismissed', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)
    localStorage.setItem('dance-schedule:hint-dismissed:text-size', JSON.stringify(true))

    renderPageMenu()

    expect(screen.getByText('Tap here for menu')).toBeInTheDocument()
  })

  // Regression test for a real bug: PageMenu.tsx's own suppression check
  // holds a READ-ONLY useFirstLaunchHint('text-size', 1) instance, while
  // FirstRunTextSizePrompt.tsx is the one that actually calls dismiss() on
  // that same id, from a completely separate component instance elsewhere
  // in the tree. Reported live: after picking a text size in that modal,
  // the kebab-menu hint never reappeared — useFirstLaunchHint.ts's own
  // cross-instance sync (useSyncExternalStore) is what this test exercises,
  // simulating the modal's own dismiss() from a sibling rather than
  // rendering the real modal component here.
  function TextSizePromptStandIn() {
    const { dismiss } = useFirstLaunchHint('text-size', 1)
    return (
      <button type="button" onClick={dismiss}>
        Simulate picking a text size
      </button>
    )
  }

  it('un-suppresses the kebab-menu hint once the text-size prompt is dismissed from elsewhere, live', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/installation']}>
        <TextSizeProvider>
          <PageMenu />
          <TextSizePromptStandIn />
        </TextSizeProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByText('Tap here for menu')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Simulate picking a text size' }))

    expect(screen.getByText('Tap here for menu')).toBeInTheDocument()
  })

  it('dismisses the hint balloon when tapping anywhere outside it', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/installation']}>
        <TextSizeProvider>
          <PageMenu />
          <button type="button">Outside</button>
        </TextSizeProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('Tap here for menu')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /outside/i }))

    expect(screen.queryByText('Tap here for menu')).not.toBeInTheDocument()
    expect(getToggle()).toHaveAttribute('data-hint-visible', 'false')
  })

  it('closes the menu when clicking outside the nav', async () => {
    dismissKebabHint()
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/installation']}>
        <TextSizeProvider>
          <PageMenu />
          <button type="button">Outside</button>
        </TextSizeProvider>
      </MemoryRouter>,
    )
    const toggle = getToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: /outside/i }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
