import { useIsElementVisible } from '../hooks/useIsElementVisible'
import styles from './ScrollToTopButton.module.css'

function scrollToTop() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
}

// Floating button that appears once the page scrolls away from the top — most
// useful on the dance-schedule grid's small-screen page-level scroll
// (docs/design/dance-schedule-mobile-scroll.md), but rendered globally in
// App.tsx rather than scoped to that page, since any page long enough to
// scroll benefits equally. Watches App.tsx's dedicated `#page-top-sentinel`
// marker, not `<nav>` itself — nav is `display: none` below the 640px
// breakpoint (Nav.module.css), so it never intersects on mobile at all, which
// left this button stuck permanently visible there regardless of scroll
// position (mobile is this button's primary use case).
export function ScrollToTopButton() {
  const isAtTop = useIsElementVisible('#page-top-sentinel')

  return (
    <button
      type="button"
      className={styles.button}
      data-visible={!isAtTop}
      onClick={scrollToTop}
      aria-label="Scroll to top"
    >
      <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
        <path
          d="M10 15V5M10 5L5 10M10 5l5 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
