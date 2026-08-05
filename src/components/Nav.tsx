import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import routes from '~react-pages'
import { buildNavTree } from '../lib/buildNavTree'
import { useDismissableMenu } from '../hooks/useDismissableMenu'
import { TextSizeControl } from './TextSizeControl'
import styles from './Nav.module.css'

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

  // Clamps the dropdown's left-aligned-to-the-toggle position (set above)
  // against the right edge of the viewport. Reported live: "Text size" is
  // typically the last (rightmost) tab, so the realistic way to reach it in
  // landscape is scrolling the tab list right first — at that point the
  // toggle itself sits near the viewport's own right edge, and the dropdown
  // (left-aligned under it, per the effect above) opened well past that
  // edge, off-screen, every time. useLayoutEffect (not useEffect) so this
  // runs — and can correct the position — before the browser paints the
  // freshly-opened dropdown, not as a visible jump after the fact. Guarded
  // to only move `left` when it's actually over the max (never increases
  // it), so this can't loop: the second pass always sees a position already
  // within bounds and does nothing.
  useLayoutEffect(() => {
    if (!isTextSizeOpen || !textSizeDropdownPosition) {
      return
    }
    const dropdown = textSizeDropdownRef.current
    if (!dropdown) {
      return
    }
    const margin = 8
    const dropdownWidth = dropdown.getBoundingClientRect().width
    const maxLeft = Math.max(margin, window.innerWidth - dropdownWidth - margin)
    if (textSizeDropdownPosition.left > maxLeft) {
      setTextSizeDropdownPosition((position) => (position ? { ...position, left: maxLeft } : position))
    }
  }, [isTextSizeOpen, textSizeDropdownPosition, textSizeDropdownRef])

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
          {/* A top-level menu item alongside the page links, styled to match
              .link and living right inside .list like every other one of
              them: it scrolls with the rest of the tabs and counts toward
              canScrollLeft/canScrollRight the same way, rather than being a
              permanently-visible exception to that. Always a dropdown here
              — reported live that an always-visible row (the previous
              portrait/desktop behavior) read as "buttons sitting on top of
              every content page" rather than a menu item, inconsistent with
              the landscape dropdown; a top-level menu item is now the only
              treatment, in every orientation. Reuses useDismissableMenu, the
              same Escape/outside-click/select-to-close behavior as
              PageMenu.tsx's own mobile dropdown. */}
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
      {/* Portaled to document.body, not rendered inline under the toggle —
          .list's overflow-y: hidden (needed for an unrelated reason, see that
          rule's own comment) would otherwise clip this dropdown the moment it
          tried to open, since the toggle above lives inside that same
          scrollable list. position: fixed with coordinates computed from the
          toggle's own getBoundingClientRect() (see the effect above) stands
          in for the normal-flow "position: absolute under its own trigger"
          PageMenu.tsx's dropdown gets for free. */}
      {isTextSizeOpen &&
        textSizeDropdownPosition &&
        createPortal(
          <div
            ref={textSizeDropdownRef}
            id={textSizeListId}
            className={styles.textSizeDropdown}
            data-open={isTextSizeOpen}
            style={{ top: textSizeDropdownPosition.top, left: textSizeDropdownPosition.left }}
          >
            {/* showHeading={false} — the toggle button right above this
                dropdown already reads "Text size"; showing it again here
                read as a redundant repeat (see TextSizeControl.tsx's own
                comment). */}
            <TextSizeControl showHeading={false} onSelect={() => setIsTextSizeOpen(false)} />
          </div>,
          document.body,
        )}
    </nav>
  )
}
