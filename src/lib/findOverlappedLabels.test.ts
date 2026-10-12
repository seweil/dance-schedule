import { describe, expect, it } from 'vitest'
import { findOverlappedLabels } from './findOverlappedLabels'

const BADGE = { top: 100, bottom: 116 }

function label(key: number, top: number, height = 15) {
  return { key, top, bottom: top + height }
}

describe('findOverlappedLabels', () => {
  it.each([
    ['fully behind the badge', label(1, 100), true],
    ['partly covered from above (only a sliver peeks out)', label(1, 90), true],
    ['partly covered from below', label(1, 110), true],
    ['just touching the badge edge', label(1, 116), false],
    ['overlapping by only the 2px tolerance', label(1, 114), false],
    ['overlapping by just over the tolerance', label(1, 113), true],
    ['well clear of the badge', label(1, 140), false],
  ])('label %s → hidden: %s', (_name, l, hidden) => {
    expect(findOverlappedLabels(BADGE, [l]).has(1)).toBe(hidden)
  })

  it('returns only the overlapped labels among several', () => {
    const result = findOverlappedLabels(BADGE, [label(1, 60), label(2, 95), label(3, 130)])
    expect([...result]).toEqual([2])
  })
})
