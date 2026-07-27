// Given a click at `clickIndex` on a dual-thumb range slider currently at
// [min, max], decides which thumb should move there and returns the resulting
// range. Deliberately branches on "is clickIndex outside [min, max]" first,
// rather than a plain distance comparison, so the closer thumb is always the one
// whose new position can't cross the other — e.g. clicking above a degenerate
// min === max range would tie under naive distance comparison, but is
// unambiguously "extend max" once outside-range is checked first.
export function moveNearestThumb(
  clickIndex: number,
  min: number,
  max: number,
): { min: number; max: number } {
  if (clickIndex <= min) {
    return { min: clickIndex, max }
  }
  if (clickIndex >= max) {
    return { min, max: clickIndex }
  }
  // Interior click — move whichever thumb is closer; an exact-midpoint tie goes to
  // min (either is equally valid there, min is just the deterministic pick).
  const distanceToMin = clickIndex - min
  const distanceToMax = max - clickIndex
  return distanceToMin <= distanceToMax ? { min: clickIndex, max } : { min, max: clickIndex }
}
