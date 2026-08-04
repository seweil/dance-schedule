import { useId } from 'react'
import { NavLink } from 'react-router-dom'
import routes from '~react-pages'
import { buildNavTree } from '../lib/buildNavTree'
import { useDismissableMenu } from '../hooks/useDismissableMenu'
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

  return (
    <nav aria-label="Site navigation" className={styles.nav} ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className={styles.toggle}
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-label="Menu"
        onClick={toggle}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
          <circle cx="10" cy="4" r="1.75" />
          <circle cx="10" cy="10" r="1.75" />
          <circle cx="10" cy="16" r="1.75" />
        </svg>
      </button>
      <ul id={listId} className={styles.list} data-open={isOpen}>
        {items.map((item) => (
          <li key={item.href}>
            {/* end (only for Home): every other route's path starts with "/" too, so
                without it NavLink's default prefix-matching would mark Home
                permanently "current" no matter which page is actually active. */}
            <NavLink to={item.href} end={item.href === '/'} className={styles.link}>
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
