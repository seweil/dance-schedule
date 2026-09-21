import { useCallback, useEffect, useRef, type RefObject } from 'react'

export interface SyncedGridScroll {
  panelRef: RefObject<HTMLDivElement | null>
  headerRef: RefObject<HTMLDivElement | null>
  setBodyRef: (node: HTMLDivElement | null) => void
}

// Shared by every dance-schedule grid (room/level/caller columns) — the two-grid
// sticky-scroll structure (a pinned header row mirroring the body's own horizontal
// scroll position) is identical across all three, only what the columns themselves
// represent differs. Extracted here once all three consumers turned out to have
// copy-pasted this verbatim — see docs/design/dance-schedule.md.
//
// `resetKey` should be the consuming grid's own `layout` object — a fresh reference
// exactly when the date or level range changes (not on a showGca toggle) — so a
// stale horizontal offset from a previous selection doesn't carry over to a new,
// unrelated set of columns.
export function useSyncedGridScroll(resetKey: unknown): SyncedGridScroll {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  // Which of panelWrapper/bodyWrapper is the element actually doing the
  // horizontal scrolling flips at the phone/short-landscape breakpoint
  // (DanceScheduleGrid.module.css) — panelWrapper above it, bodyWrapper below
  // it. Read that back from the live computed style rather than duplicating the
  // breakpoint's own media condition here, so the two can never drift apart.
  // The edge-cue data attributes always live on panelWrapper regardless (see
  // .edgeLeft/.edgeRight in the CSS module), since that's the one element
  // that's never itself scrolled out of view.
  const updateScrollEdges = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    const usesPanelScroll = getComputedStyle(panel).overflowX !== 'visible'
    const scroller = usesPanelScroll ? panel : bodyRef.current
    if (!scroller) return
    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth
    panel.dataset.canScrollLeft = String(scroller.scrollLeft > 1)
    panel.dataset.canScrollRight = String(maxScrollLeft > 1 && scroller.scrollLeft < maxScrollLeft - 1)
    // .edgeLeft/.edgeRight's sticky positioning (desktop only — see the CSS
    // module) needs an explicit height, not the `height: 100%` a plain CSS-only
    // approach would reach for: panelWrapper's own height comes from
    // `max-height: 70vh` clamping an otherwise-auto box, and a clamped-auto
    // height doesn't count as "specified" for a percentage-height child to
    // resolve against — confirmed live, it silently resolved as 0 instead.
    // Reading the panel's own clientHeight back like this works regardless of
    // *why* it's the height it is (short content, the 70vh clamp, or a bigger
    // text-size preference growing every row).
    panel.style.setProperty('--panel-visible-height', `${panel.clientHeight}px`)
  }, [])

  const handleBodyScroll = useCallback(
    (event: Event) => {
      const header = headerRef.current
      const body = event.currentTarget as HTMLDivElement
      if (header) {
        header.scrollLeft = body.scrollLeft
      }
      updateScrollEdges()
    },
    [updateScrollEdges],
  )

  // A callback ref, not a useEffect — the consuming component can early-return past
  // this point (an empty-filter-results branch), unmounting these wrappers entirely;
  // a callback ref correctly re-attaches the listener each time they remount, where a
  // mount-only effect reading .current would miss that transition.
  const setBodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      bodyRef.current?.removeEventListener('scroll', handleBodyScroll)
      bodyRef.current = node
      node?.addEventListener('scroll', handleBodyScroll, { passive: true })
      updateScrollEdges()
    },
    [handleBodyScroll, updateScrollEdges],
  )

  // panelWrapper mounts/unmounts in lockstep with header/body (all three come from
  // the same early-return branch above), so a plain ref suffices here the same way
  // it already does for headerRef.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    panel.addEventListener('scroll', updateScrollEdges, { passive: true })
    window.addEventListener('resize', updateScrollEdges)
    // Catches a row-height change with no window resize at all — e.g. the
    // text-size preference (FirstRunTextSizePrompt) growing every rem-based
    // row, which changes panelWrapper's own clientHeight/scrollWidth just as
    // much as resizing the window would.
    const observer = new ResizeObserver(updateScrollEdges)
    observer.observe(panel)
    updateScrollEdges()
    return () => {
      panel.removeEventListener('scroll', updateScrollEdges)
      window.removeEventListener('resize', updateScrollEdges)
      observer.disconnect()
    }
  }, [updateScrollEdges])

  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = 0
    }
    if (bodyRef.current) {
      bodyRef.current.scrollLeft = 0
    }
    updateScrollEdges()
  }, [resetKey, updateScrollEdges])

  return { panelRef, headerRef, setBodyRef }
}
