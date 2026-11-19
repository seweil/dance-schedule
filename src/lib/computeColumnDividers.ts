// A dark vertical line marking where one group of columns ends and the next
// begins (the level-columns view's square-dance levels | round-dance phases |
// Other). One segment per unbroken run of rows: a placement spanning ACROSS the
// boundary (a roomless banner over every column) interrupts it, so the line
// never cuts through a card.
export interface ColumnDivider {
  // 0-based index of the first column of the group the line sits before.
  column: number
  // 1-based, like the placements' own rowStart.
  rowStart: number
  rowSpan: number
}

interface SpanningPlacement {
  rowStart: number
  rowSpan: number
  columnStart: number
  columnSpan: number
}

export function computeColumnDividers(
  groupStartColumns: readonly number[],
  placements: readonly SpanningPlacement[],
  totalRows: number,
): ColumnDivider[] {
  const dividers: ColumnDivider[] = []
  for (const column of groupStartColumns) {
    const blocked = new Set<number>()
    for (const p of placements) {
      if (p.columnStart < column && p.columnStart + p.columnSpan > column) {
        for (let row = p.rowStart; row < p.rowStart + p.rowSpan; row++) blocked.add(row)
      }
    }
    let runStart: number | undefined
    for (let row = 1; row <= totalRows + 1; row++) {
      const open = row <= totalRows && !blocked.has(row)
      if (open && runStart === undefined) runStart = row
      if (!open && runStart !== undefined) {
        dividers.push({ column, rowStart: runStart, rowSpan: row - runStart })
        runStart = undefined
      }
    }
  }
  return dividers
}
