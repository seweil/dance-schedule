import { useId } from 'react'
import { NavLink } from 'react-router-dom'
import routes from '~react-pages'
import { buildNavTree } from '../lib/buildNavTree'
import { useDismissableMenu } from '../hooks/useDismissableMenu'
import { useFirstLaunchHint } from '../hooks/useFirstLaunchHint'
import { usePinnedMediaQuery } from '../hooks/usePinnedMediaQuery'
import { PHONE_QUERY } from '../lib/breakpoints'
import { HintBalloon } from './HintBalloon'
import { TextSizeControl } from './TextSizeControl'
import styles from './PageMenu.module.css'

// The mobile counterpart to Nav.tsx's desktop tab bar — a kebab toggle + dropdown
// link list, rendered fresh inside each page's own PageHeader (via
// PageHeader.tsx), not once globally in App.tsx, so it visually shares a row with
// that page's title instead of sitting in its own bar above all page content.
// Hidden entirely at ≥641px (see PageMenu.module.css) — Nav.tsx's bar is the
// visible one there instead.
//
// Unlike the single combined component this replaced, this needs no explicit
// "close on route change" effect: since it's mounted fresh per page (a different
// route is a different React component entirely, per useRoutes), navigating away
// unmounts this instance outright — the next page's PageMenu always starts closed,
// the same end result the old pathname-watching effect produced, just for free.
export function PageMenu() {
  const items = buildNavTree(routes)
  const { isOpen, setIsOpen, toggle, rootRef, toggleRef } = useDismissableMenu<
    HTMLElement,
    HTMLButtonElement
  >()
  const listId = useId()
  // Reported live: a bare "⋮" kebab icon (aria-label alone, for screen
  // readers) was too easy for a new user to miss entirely — see
  // docs/design/onboarding-hints.md. A visible text label next to it was
  // tried first and reported live as looking bad; switched to a hamburger
  // ("☰") glyph instead — a much more universally recognized "menu" symbol
  // than a kebab, so it doesn't need an accompanying label to read as
  // tappable. The hint balloon below is additional, temporary reinforcement
  // during a new user's first few launches specifically, on top of that
  // permanent icon change.
  const { shouldShow: kebabHintEligible, dismiss: dismissHint } = useFirstLaunchHint('kebab-menu')
  // Read-only, same as RotateDeviceBanner.tsx's own read of these two ids —
  // FirstRunTextSizePrompt.tsx's modal has the highest z-index in the app
  // and visually covers this hint entirely while it's up, but HintBalloon's
  // own global "swallow the very next click" mechanism (its own comment)
  // isn't aware of that: it arms unconditionally on ANY tap that isn't on
  // ITS balloon, including one that actually landed on the modal's own
  // buttons, and then eats that click before the modal's onClick ever
  // fires — reported live as "clicking any text-size button dismisses the
  // kebab hint, but doesn't set the size or close the dialog." Suppressing
  // this hint outright while the modal is up (rather than trying to make
  // HintBalloon coverage-aware) sidesteps the whole class of bug: if it
  // never mounts, its listener never arms in the first place. Mirrors
  // FirstRunTextSizePrompt.tsx's own isVisible check exactly (PHONE_QUERY
  // + shouldShow, both pinned at mount via usePinnedMediaQuery rather than
  // the reactive useMediaQuery — see that hook's own comment) so this only
  // suppresses while that modal is ACTUALLY showing, not merely
  // eligible-but-hidden-by-width.
  const isPhone = usePinnedMediaQuery(PHONE_QUERY)
  const { shouldShow: firstRunPromptVisible } = useFirstLaunchHint('text-size', 1)
  const showHint = kebabHintEligible && !(isPhone && firstRunPromptVisible)

  function handleToggleClick() {
    toggle()
    // Tapping the real toggle means the hint did its job — no reason to keep
    // showing it on THIS device's remaining onboarding launches once the
    // person has already found the menu once. Usually a no-op by the time
    // this actually runs: while the hint is showing, HintBalloon's own
    // pointerdown listener already dismisses it (and swallows THIS click —
    // see its own targetRef comment for why the toggle deliberately gets no
    // exemption) before handleToggleClick ever fires, so toggle() itself
    // only executes on a SECOND, deliberate tap once the hint is already
    // gone. Kept here anyway for the keyboard-activation path (Enter/Space
    // on a focused toggle fires 'click' directly, with no preceding
    // 'pointerdown' to have dismissed it already).
    dismissHint()
  }

  return (
    <nav aria-label="Site navigation" className={styles.nav} ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className={styles.toggle}
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-label="Menu"
        onClick={handleToggleClick}
        data-hint-visible={showHint}
      >
        <svg viewBox="0 0 20 20" width="24" height="24" fill="none" aria-hidden="true">
          <path
            d="M3 6H17M3 10H17M3 14H17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {/* No targetRef — see HintBalloon.tsx's own comment on that prop for
          why the toggle deliberately does NOT get the "tap the real target
          still performs its action" exemption. */}
      {showHint && <HintBalloon message="Tap here for menu" onDismiss={dismissHint} />}
      <ul id={listId} className={styles.list} data-open={isOpen}>
        {items.map((item) => (
          <li key={item.href}>
            {/* end (only for Home): every other route's path starts with "/" too, so
                without it NavLink's default prefix-matching would mark Home
                permanently "current" no matter which page is actually active. */}
            <NavLink
              to={item.href}
              end={item.href === '/'}
              className={styles.link}
              data-emphasized={item.emphasized}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
        <li className={styles.textSizeItem}>
          {/* onSelect: unlike the page links above it, choosing a size doesn't
              navigate anywhere, so nothing else would close this dropdown —
              see TextSizeControl.tsx's own comment. */}
          <TextSizeControl onSelect={() => setIsOpen(false)} />
        </li>
      </ul>
    </nav>
  )
}
