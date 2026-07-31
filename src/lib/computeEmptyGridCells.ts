export interface GridSpan {
  rowStart: number
  rowSpan: number
  columnStart: number
  columnSpan: number
}

export interface EmptyGridCell {
  row: number
  // 0-based, matching a placement's own columnStart indexing.
  column: number
  // Whether to draw a line above this cell — only when the cell directly above
  // (or there isn't one, i.e. row 1) is ALSO empty. A line against an occupied
  // neighbor would sit directly against that card's own rounded corner
  // (DanceScheduleGrid.module.css's .card border-radius), reading as a stray
  // straight-edge artifact poking out of the curve rather than a deliberate
  // line — see docs/design/dance-schedule.md.
  showTop: boolean
  // Same idea, for the cell directly to the left (or there isn't one, i.e. the
  // leftmost room/level column — that one borders the sticky time-label column,
  // not another placement, so it's never suppressed for this reason).
  showLeft: boolean
}

// Computes exactly which (row, column) grid cells have no session placement
// covering them at all, and — for each one — whether its top/left border
// would land next to an occupied cell. Used by DanceScheduleGrid.tsx and
// DanceScheduleLevelGrid.tsx to draw very subtle gridlines ONLY where nothing
// is scheduled, never touching a card. A cell fully inside a column- or
// row-spanning placement is never in the occupied set's complement in the
// first place, so no line is ever considered for it — "not adjacent to a
// filled cell" and "not needed within a spanned event" both fall out of the
// same occupancy check, not two separate rules.
export function computeEmptyGridCells(
  totalRows: number,
  columnCount: number,
  placements: readonly GridSpan[],
): EmptyGridCell[] {
  const occupied = new Set<string>()
  for (const { rowStart, rowSpan, columnStart, columnSpan } of placements) {
    for (let row = rowStart; row < rowStart + rowSpan; row++) {
      for (let column = columnStart; column < columnStart + columnSpan; column++) {
        occupied.add(`${row},${column}`)
      }
    }
  }
  const isOccupied = (row: number, column: number) => occupied.has(`${row},${column}`)

  const cells: EmptyGridCell[] = []
  for (let row = 1; row <= totalRows; row++) {
    for (let column = 0; column < columnCount; column++) {
      if (isOccupied(row, column)) {
        continue
      }
      cells.push({
        row,
        column,
        showTop: row === 1 || !isOccupied(row - 1, column),
        showLeft: column === 0 || !isOccupied(row, column - 1),
      })
    }
  }
  return cells
}
