import { useEffect, useId, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import routes from '~react-pages'
import { buildNavTree } from '../lib/buildNavTree'
import { useDismissableMenu } from '../hooks/useDismissableMenu'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { TextSizeControl } from './TextSizeControl'
import styles from './Nav.module.css'

// A landscape phone/tablet has much less vertical room to spare than a
// typical portrait one or a desktop monitor (always landscape-shaped, but
// with plenty of height regardless) — reported live as the reason the
// always-visible "Text size" row below the tab bar felt like it was eating
// into scarce vertical space specifically there. In portrait (or on a
// desktop monitor, where height was never the constraint), the row stays
// exactly as it was: always visible, no extra click needed.
const LANDSCAPE_QUERY = '(orientation: landscape)'

// The desktop-only flat tab-link bar — always visible at ≥641px, hidden entirely
// below that (see Nav.module.css), where PageMenu.tsx (rendered per-page, sharing
// a row with that page's own title via PageHeader.tsx) is the equivalent
// navigation UI instead. Rendered once, globally, in App.tsx — unlike PageMenu,
// there's nothing page-specific about this component, so one shared instance
// above all page content is the right shape for it.
export function Nav() {
  const items = buildNavTree(routes)
  const listRef = useRef<HTMLUListElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const isLandscape = useMediaQuery(LANDSCAPE_QUERY)
  const {
    isOpen: isTextSizeOpen,
    setIsOpen: setIsTextSizeOpen,
    toggle: toggleTextSize,
    rootRef: textSizeRootRef,
    toggleRef: textSizeToggleRef,
  } = useDismissableMenu<HTMLDivElement, HTMLButtonElement>()
  const textSizeListId = useId()

  // Tracks whether the tab list actually has more content to scroll to in each
  // direction, so the arrow buttons below only ever show when they'd do something
  // (see Nav.module.css's own comment for why this replaced a CSS-only approach).
  // A ResizeObserver, not just a scroll listener, is what catches the case that
  // originally motivated this: switching to a larger text size
  // (useTextSizePreference.ts) makes every tab wider without the window itself
  // resizing or the list being scrolled — a plain resize/scroll listener pair
  // alone would miss that.
  useEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }

    function updateScrollState() {
      const { scrollLeft, scrollWidth, clientWidth } = list!
      setCanScrollLeft(scrollLeft > 0)
      // -1 tolerance for sub-pixel rounding — without it, some zoom levels/DPRs
      // left canScrollRight permanently true by a fraction of a pixel even at
      // the true scrolled-to-the-end position.
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1)
    }

    updateScrollState()
    list.addEventListener('scroll', updateScrollState)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(list)

    return () => {
      list.removeEventListener('scroll', updateScrollState)
      resizeObserver.disconnect()
    }
    // items.length: a route added/removed changes how much content there is to
    // scroll, which the ResizeObserver above (watching the list's own box, not
    // its content) wouldn't otherwise catch on its own.
  }, [items.length])

  return (
    <nav aria-label="Site navigation" className={styles.nav}>
      {/* .topRow only matters in landscape (see LANDSCAPE_QUERY's own CSS rule) —
          it's what lets the Text size toggle sit beside .listWrapper instead of
          below it. .listWrapper's own .list scrolls horizontally
          (overflow-x: auto), which per spec forces its OTHER axis to also clip
          (overflow-y: hidden, set explicitly below) — the toggle's dropdown
          couldn't overflow downward out of a container that clips vertically,
          so it has to live outside .listWrapper entirely, not as another item
          inside .list, even though it's meant to read as a peer of the page
          links in it. */}
      <div className={styles.topRow}>
        <div className={styles.listWrapper}>
          {canScrollLeft && (
            <button
              type="button"
              className={`${styles.scrollButton} ${styles.scrollButtonLeft}`}
              aria-label="Scroll tabs left"
              onClick={() => listRef.current?.scrollTo({ left: 0, behavior: 'smooth' })}
            >
              ‹
            </button>
          )}
          <ul className={styles.list} ref={listRef}>
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
          </ul>
          {canScrollRight && (
            <button
              type="button"
              className={`${styles.scrollButton} ${styles.scrollButtonRight}`}
              aria-label="Scroll tabs right"
              onClick={() =>
                listRef.current?.scrollTo({ left: listRef.current.scrollWidth, behavior: 'smooth' })
              }
            >
              ›
            </button>
          )}
        </div>
        {/* Landscape only — a top-level menu item alongside the page links
            (styled to match .link), not a separate always-visible row, so it
            costs nothing vertically until actually opened. Always visible
            itself (flex-shrink: 0, unlike the scrollable tabs beside it) —
            a settings toggle scrolling out of view along with the tabs would
            be its own usability problem. Reuses useDismissableMenu, the same
            Escape/outside-click/select-to-close behavior as PageMenu.tsx's
            own mobile dropdown. */}
        {isLandscape && (
          <div className={styles.textSizeMenu} ref={textSizeRootRef}>
            <button
              ref={textSizeToggleRef}
              type="button"
              className={styles.textSizeToggle}
              aria-expanded={isTextSizeOpen}
              aria-controls={textSizeListId}
              onClick={toggleTextSize}
            >
              Text size
            </button>
            <div id={textSizeListId} className={styles.textSizeDropdown} data-open={isTextSizeOpen}>
              <TextSizeControl onSelect={() => setIsTextSizeOpen(false)} />
            </div>
          </div>
        )}
      </div>
      {/* Portrait/desktop only — the complementary case to the dropdown menu
          item above; see LANDSCAPE_QUERY's own comment for why the two differ. */}
      {!isLandscape && (
        <div className={styles.textSizeRow}>
          <TextSizeControl />
        </div>
      )}
    </nav>
  )
}
