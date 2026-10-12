import { useLayoutEffect, useState, type RefObject } from 'react'
import { findOverlappedLabels, type VerticalExtent } from '../lib/findOverlappedLabels'

const NONE: ReadonlySet<number> = new Set()

// The label's TEXT extent, not its element's: a .timeLabel cell stretches the
// full height of its (content-sized) row, while its text sits at the top. Null
// where layout isn't available (jsdom has no Range geometry).
function textExtent(element: HTMLElement): VerticalExtent | null {
  const range = document.createRange()
  range.selectNodeContents(element)
  if (typeof range.getBoundingClientRect !== 'function') return null
  const { top, bottom } = range.getBoundingClientRect()
  return { top, bottom }
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value))
}

/**
 * Row numbers (TimeMark.rowStart) of the time-axis labels the current-time badge
 * actually covers on screen — measured, since rows are content-sized and so how
 * close is "too close" is a pixel question, not a minutes one. Labels are found
 * via their `data-time-label-row` attribute inside `gridRef`. Re-measured when
 * `trigger` changes (the badge moved) and whenever the grid resizes (text-size
 * preference, cards growing).
 */
export function useLabelsCoveredByBadge(
  gridRef: RefObject<HTMLElement | null>,
  badgeRef: RefObject<HTMLElement | null>,
  trigger: unknown,
): ReadonlySet<number> {
  const [covered, setCovered] = useState<ReadonlySet<number>>(NONE)

  useLayoutEffect(() => {
    const grid = gridRef.current

    function measure() {
      const badge = badgeRef.current
      let next: ReadonlySet<number> = NONE
      if (grid && badge) {
        const { top, bottom } = badge.getBoundingClientRect()
        const labels = [...grid.querySelectorAll<HTMLElement>('[data-time-label-row]')].flatMap((element) => {
          const extent = textExtent(element)
          return extent ? [{ ...extent, key: Number(element.dataset.timeLabelRow) }] : []
        })
        next = findOverlappedLabels({ top, bottom }, labels)
      }
      // Hiding a label's text doesn't move it, so this can't oscillate — but skip
      // the state update when nothing changed to avoid a pointless re-render.
      setCovered((previous) => (sameSet(previous, next) ? previous : next))
    }

    measure()
    if (!grid || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [gridRef, badgeRef, trigger])

  return covered
}
