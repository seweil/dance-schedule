import { describe, expect, it } from 'vitest'
import { computeColumnDividers } from './computeColumnDividers'

describe('computeColumnDividers', () => {
  it('runs the full height when nothing crosses the boundary', () => {
    const placements = [{ rowStart: 1, rowSpan: 2, columnStart: 0, columnSpan: 2 }]
    expect(computeColumnDividers([2], placements, 4)).toEqual([{ column: 2, rowStart: 1, rowSpan: 4 }])
  })

  it('breaks around a placement spanning across the boundary', () => {
    const banner = { rowStart: 2, rowSpan: 1, columnStart: 0, columnSpan: 4 }
    expect(computeColumnDividers([2], [banner], 4)).toEqual([
      { column: 2, rowStart: 1, rowSpan: 1 },
      { column: 2, rowStart: 3, rowSpan: 2 },
    ])
  })

  it('is not broken by a placement that merely starts or ends at the boundary', () => {
    const left = { rowStart: 1, rowSpan: 4, columnStart: 0, columnSpan: 2 }
    const right = { rowStart: 1, rowSpan: 4, columnStart: 2, columnSpan: 1 }
    expect(computeColumnDividers([2], [left, right], 4)).toEqual([{ column: 2, rowStart: 1, rowSpan: 4 }])
  })

  it('returns one set of segments per group boundary, and none without boundaries', () => {
    expect(computeColumnDividers([2, 5], [], 3)).toEqual([
      { column: 2, rowStart: 1, rowSpan: 3 },
      { column: 5, rowStart: 1, rowSpan: 3 },
    ])
    expect(computeColumnDividers([], [], 3)).toEqual([])
  })
})
