import { useIsElementVisible } from '../hooks/useIsElementVisible'
import styles from './ScrollToTopButton.module.css'

function scrollToTop() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
}

// Floating button that appears once the site nav (the page's one <nav> landmark)
// scrolls out of view — most useful on the dance-schedule grid's small-screen
// page-level scroll (docs/design/dance-schedule-mobile-scroll.md), but rendered
// globally in App.tsx rather than scoped to that page, since any page long enough
// to scroll the nav away benefits equally.
export function ScrollToTopButton() {
  const isNavVisible = useIsElementVisible('nav')

  return (
    <button
      type="button"
      className={styles.button}
      data-visible={!isNavVisible}
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
