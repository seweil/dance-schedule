import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
    portalRef: textSizeDropdownRef,
  } = useDismissableMenu<HTMLLIElement, HTMLButtonElement, HTMLDivElement>()
  const textSizeListId = useId()
  // The dropdown is portaled to document.body (see the render below for why),
  // so it can't just be `position: absolute` against a normal-flow ancestor
  // the way PageMenu.tsx's own dropdown is — this tracks the toggle's own
  // on-screen position instead, recomputed whenever it could plausibly have
  // moved: on open, on window resize, and on the tab list's own horizontal
  // scroll (the toggle lives inside that scrollable list, so scrolling it
  // moves the toggle even though the window itself didn't resize).
  const [textSizeDropdownPosition, setTextSizeDropdownPosition] = useState<{
    top: number
    left: number
  } | null>(null)

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

  useEffect(() => {
    if (!isTextSizeOpen) {
      return
    }

    function updatePosition() {
      const rect = textSizeToggleRef.current?.getBoundingClientRect()
      if (rect) {
        setTextSizeDropdownPosition({ top: rect.bottom, left: rect.left })
      }
    }

    updatePosition()
    const list = listRef.current
    window.addEventListener('resize', updatePosition)
    list?.addEventListener('scroll', updatePosition)
    return () => {
      window.removeEventListener('resize', updatePosition)
      list?.removeEventListener('scroll', updatePosition)
    }
  }, [isTextSizeOpen, textSizeToggleRef])

  return (
    <nav aria-label="Site navigation" className={styles.nav}>
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
          {/* Landscape only — a top-level menu item alongside the page links,
              styled to match .link and living right inside .list like every
              other one of them: it scrolls with the rest of the tabs and
              counts toward canScrollLeft/canScrollRight the same way, rather
              than being a permanently-visible exception to that. Reuses
              useDismissableMenu, the same Escape/outside-click/select-to-close
              behavior as PageMenu.tsx's own mobile dropdown. */}
          {isLandscape && (
            <li ref={textSizeRootRef}>
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
            </li>
          )}
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
      {/* Portrait/desktop only — the complementary case to the dropdown menu
          item above; see LANDSCAPE_QUERY's own comment for why the two differ. */}
      {!isLandscape && (
        <div className={styles.textSizeRow}>
          <TextSizeControl />
        </div>
      )}
      {/* Portaled to document.body, not rendered inline under the toggle —
          .list's overflow-y: hidden (needed for an unrelated reason, see that
          rule's own comment) would otherwise clip this dropdown the moment it
          tried to open, since the toggle above lives inside that same
          scrollable list. position: fixed with coordinates computed from the
          toggle's own getBoundingClientRect() (see the effect above) stands
          in for the normal-flow "position: absolute under its own trigger"
          PageMenu.tsx's dropdown gets for free. */}
      {isLandscape &&
        isTextSizeOpen &&
        textSizeDropdownPosition &&
        createPortal(
          <div
            ref={textSizeDropdownRef}
            id={textSizeListId}
            className={styles.textSizeDropdown}
            data-open={isTextSizeOpen}
            style={{ top: textSizeDropdownPosition.top, left: textSizeDropdownPosition.left }}
          >
            <TextSizeControl onSelect={() => setIsTextSizeOpen(false)} />
          </div>,
          document.body,
        )}
    </nav>
  )
}
