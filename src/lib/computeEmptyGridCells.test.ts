import { describe, expect, it } from 'vitest'
import { computeEmptyGridCells, type GridSpan } from './computeEmptyGridCells'

function span(rowStart: number, rowSpan: number, columnStart: number, columnSpan: number): GridSpan {
  return { rowStart, rowSpan, columnStart, columnSpan }
}

function find(cells: ReturnType<typeof computeEmptyGridCells>, row: number, column: number) {
  return cells.find((cell) => cell.row === row && cell.column === column)
}

describe('computeEmptyGridCells', () => {
  it('returns an empty array for a zero-size grid', () => {
    expect(computeEmptyGridCells(0, 0, [])).toEqual([])
  })

  it('marks every cell empty, with both borders shown, when nothing is placed', () => {
    const cells = computeEmptyGridCells(2, 2, [])
    expect(cells).toHaveLength(4)
    expect(cells.every((cell) => cell.showTop && cell.showLeft)).toBe(true)
  })

  it('excludes a placement\'s own cell from the result entirely', () => {
    const cells = computeEmptyGridCells(3, 3, [span(2, 1, 1, 1)])
    expect(find(cells, 2, 1)).toBeUndefined()
    expect(cells).toHaveLength(8)
  })

  it("suppresses the empty neighbor's top border when the cell directly above is occupied", () => {
    const cells = computeEmptyGridCells(3, 1, [span(1, 1, 0, 1)])
    // Row 1, column 0 is occupied; row 2 is empty but sits directly below it.
    expect(find(cells, 2, 0)?.showTop).toBe(false)
    // Row 3 sits below an EMPTY row 2, so its own top border is fine to show.
    expect(find(cells, 3, 0)?.showTop).toBe(true)
  })

  it("suppresses the empty neighbor's left border when the cell directly to the left is occupied", () => {
    const cells = computeEmptyGridCells(1, 3, [span(1, 1, 0, 1)])
    expect(find(cells, 1, 1)?.showLeft).toBe(false)
    expect(find(cells, 1, 2)?.showLeft).toBe(true)
  })

  it('always shows the top border for row 1 (nothing above it to clash with)', () => {
    const cells = computeEmptyGridCells(1, 1, [])
    expect(find(cells, 1, 0)?.showTop).toBe(true)
  })

  it('always shows the left border for column 0 (borders the time column, not a placement)', () => {
    const cells = computeEmptyGridCells(1, 1, [])
    expect(find(cells, 1, 0)?.showLeft).toBe(true)
  })

  it('excludes every cell under a row-spanning placement, and suppresses the border right below it', () => {
    const cells = computeEmptyGridCells(4, 1, [span(1, 3, 0, 1)])
    expect(find(cells, 1, 0)).toBeUndefined()
    expect(find(cells, 2, 0)).toBeUndefined()
    expect(find(cells, 3, 0)).toBeUndefined()
    expect(find(cells, 4, 0)?.showTop).toBe(false)
  })

  it('excludes every cell under a column-spanning placement, and suppresses the border right after it', () => {
    const cells = computeEmptyGridCells(1, 4, [span(1, 1, 0, 3)])
    expect(find(cells, 1, 0)).toBeUndefined()
    expect(find(cells, 1, 1)).toBeUndefined()
    expect(find(cells, 1, 2)).toBeUndefined()
    expect(find(cells, 1, 3)?.showLeft).toBe(false)
  })

  it('treats a roomless placement spanning every column the same as any other span', () => {
    const cells = computeEmptyGridCells(2, 3, [span(1, 1, 0, 3)])
    expect(cells.filter((cell) => cell.row === 1)).toHaveLength(0)
    expect(cells.filter((cell) => cell.row === 2)).toHaveLength(3)
    // Row 2 sits directly below the occupied roomless row, so each of its
    // cells correctly suppresses its own top border, same as any other span.
    expect(cells.filter((cell) => cell.row === 2).every((cell) => !cell.showTop)).toBe(true)
  })
})
