import { useCallback, useEffect, useRef, type RefObject } from 'react'

export interface SyncedGridScroll {
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
  const headerRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const handleBodyScroll = useCallback((event: Event) => {
    const header = headerRef.current
    const body = event.currentTarget as HTMLDivElement
    if (header) {
      header.scrollLeft = body.scrollLeft
    }
  }, [])

  // A callback ref, not a useEffect — the consuming component can early-return past
  // this point (an empty-filter-results branch), unmounting these wrappers entirely;
  // a callback ref correctly re-attaches the listener each time they remount, where a
  // mount-only effect reading .current would miss that transition.
  const setBodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      bodyRef.current?.removeEventListener('scroll', handleBodyScroll)
      bodyRef.current = node
      node?.addEventListener('scroll', handleBodyScroll, { passive: true })
    },
    [handleBodyScroll],
  )

  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = 0
    }
    if (bodyRef.current) {
      bodyRef.current.scrollLeft = 0
    }
  }, [resetKey])

  return { headerRef, setBodyRef }
}
