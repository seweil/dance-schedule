import { describe, expect, it } from 'vitest'
import { moveNearestThumb } from './moveNearestThumb'

describe('moveNearestThumb', () => {
  it('moves min when the click is below the current range', () => {
    expect(moveNearestThumb(0, 3, 7)).toEqual({ min: 0, max: 7 })
  })

  it('moves max when the click is above the current range', () => {
    expect(moveNearestThumb(9, 3, 7)).toEqual({ min: 3, max: 9 })
  })

  it('moves min when the click is exactly on the current min', () => {
    expect(moveNearestThumb(3, 3, 7)).toEqual({ min: 3, max: 7 })
  })

  it('moves max when the click is exactly on the current max', () => {
    expect(moveNearestThumb(7, 3, 7)).toEqual({ min: 3, max: 7 })
  })

  it('moves whichever thumb is closer for an interior click', () => {
    expect(moveNearestThumb(4, 3, 7)).toEqual({ min: 4, max: 7 })
    expect(moveNearestThumb(6, 3, 7)).toEqual({ min: 3, max: 6 })
  })

  it('breaks an exact-midpoint tie by moving min', () => {
    expect(moveNearestThumb(5, 3, 7)).toEqual({ min: 5, max: 7 })
  })

  it('never crosses the other thumb, even clicking above a degenerate min === max range', () => {
    // A naive distance comparison ties here (both distances are 1) and could pick
    // "min", producing min=4 > max=3 — this must extend max instead.
    expect(moveNearestThumb(4, 3, 3)).toEqual({ min: 3, max: 4 })
  })

  it('never crosses the other thumb, even clicking below a degenerate min === max range', () => {
    expect(moveNearestThumb(2, 3, 3)).toEqual({ min: 2, max: 3 })
  })

  it('is a no-op when clicking exactly on a degenerate min === max range', () => {
    expect(moveNearestThumb(3, 3, 3)).toEqual({ min: 3, max: 3 })
  })
})
