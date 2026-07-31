// Programmatically appends new rooms/rows to content/test/data/dance-schedule.xlsx —
// the deliberately edge-case-flavored fixture set (never automated-testing, which
// both unit and e2e tests assert against directly). Kept as a reusable tool, not a
// throwaway script: run again with a new `additions` entry any time a new edge case
// needs a visual home in the test grid.
//
// Usage: node scripts/edit-test-data.mjs
//
// Each addition either:
//   - adds a brand-new room column (if `room` isn't already a header on `sheet`) and
//     one new data row for it, or
//   - adds a new data row to an already-existing room column.
// A row's OTHER room cells are left blank — parseDanceScheduleSheet.ts already
// treats a data row shorter than the header row's column count as blank for the
// missing trailing cells, so there's no need to backfill every other room's cell.

import ExcelJS from 'exceljs'

const WORKBOOK_PATH = 'content/test/data/dance-schedule.xlsx'

const additions = [
  {
    // Real sheet name (ignore its literal weekday word — parseSheetDate only trusts
    // the month/day; this sheet is deliberately mislabeled "Monday" even though
    // Jan 5, 2027 is a real Tuesday, and displays correctly as such). Existing Test
    // Room A already has three back-to-back 1-hour sessions here (9-10/10-11/11-12)
    // — this new room's single 9:00-12:00 session spans all three, demonstrating a
    // long event whose rowSpan reflects concurrent activity elsewhere, not just its
    // own clock duration (see docs/design/dance-schedule.md).
    sheet: 'Monday Jan 5',
    room: 'Test Room D',
    timeRange: '9:00a-12:00p',
    cellText: 'Plus : Long Workshop - Test Caller Eight',
  },
]

const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(WORKBOOK_PATH)

for (const { sheet: sheetName, room, timeRange, cellText } of additions) {
  const sheet = workbook.getWorksheet(sheetName)
  if (!sheet) {
    throw new Error(`Sheet ${JSON.stringify(sheetName)} not found in ${WORKBOOK_PATH}`)
  }

  const headerRow = sheet.getRow(1)
  let roomColumn = null
  let lastColumn = 1 // column A is Time
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    lastColumn = Math.max(lastColumn, colNumber)
    if (String(cell.value).trim() === room) {
      roomColumn = colNumber
    }
  })

  if (roomColumn === null) {
    roomColumn = lastColumn + 1
    headerRow.getCell(roomColumn).value = room
    headerRow.commit()
    console.log(`Added new room column ${JSON.stringify(room)} at column ${roomColumn} on ${JSON.stringify(sheetName)}`)
  }

  const newRow = sheet.getRow(sheet.rowCount + 1)
  newRow.getCell(1).value = timeRange
  newRow.getCell(roomColumn).value = cellText
  newRow.commit()
  console.log(
    `Added row ${newRow.number} on ${JSON.stringify(sheetName)}: ${timeRange} / ${room} / ${cellText}`,
  )
}

await workbook.xlsx.writeFile(WORKBOOK_PATH)
console.log(`Saved ${WORKBOOK_PATH}`)
