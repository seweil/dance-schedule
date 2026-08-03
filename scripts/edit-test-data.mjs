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
  // Everything below is visual-review fixture data only (per direct product
  // decision) — no automated test asserts any of this. Existing names/rooms are
  // uniformly "Test Caller N"/"Test Room X"; these add the visual variety that
  // pattern doesn't cover: accented names, very long/short names, long details
  // text, a 3-caller session, and long/short room names. See
  // content/test/pages/2 edge-cases.md for the full catalog. All new rows/rooms
  // avoid any time overlap with existing bookings (room- or caller-wise) on this
  // sheet, since the build fails loudly on a real double-booking.
  {
    // 3-caller co-taught session — existing coverage tops out at 2 callers.
    sheet: 'Monday Jan 5',
    room: 'Test Room A',
    timeRange: '12:30p-1:30p',
    cellText: 'Plus : Dancing - Test Caller One & Test Caller Two & Zed',
  },
  {
    // Accented name (ç, ô), isolated from any other edge case in this session.
    sheet: 'Monday Jan 5',
    room: 'Test Room B',
    timeRange: '1:00p-2:00p',
    cellText: 'SSD : Dancing - François Côté',
  },
  {
    // Long plain-ASCII name — isolated from the accented case above so the two
    // effects (long vs. accented) are visually distinguishable.
    sheet: 'Monday Jan 5',
    room: 'Test Room D',
    timeRange: '1:00p-2:00p',
    cellText: 'C2 : Dancing - Alexander Bartholomew Fitzgerald-Montgomery',
  },
  {
    // New room with a deliberately long name, to check column-header wrapping at
    // the opposite extreme from "Gym" below.
    sheet: 'Monday Jan 5',
    room: 'The Grand Overflow Annex Ballroom',
    timeRange: '1:00p-2:00p',
    cellText: 'SSD : Dancing - Test Caller Three',
  },
  {
    // New room with a deliberately short, single-word name.
    sheet: 'Monday Jan 5',
    room: 'Gym',
    timeRange: '1:00p-2:00p',
    cellText: 'C4 : Dancing - Test Caller Four',
  },
  {
    // A second accented name (ö, å), different diacritics than François Côté above.
    sheet: 'Monday Jan 5',
    room: 'Test Room C',
    timeRange: '2:00p-3:00p',
    cellText: 'MS : Dancing - Björn Åström',
  },
  {
    // Very short, single-word caller name — checks the caller-column view's
    // minimum-width layout, and (nice side effect) gives an obvious visual check
    // of alphabetical-by-first-name caller ordering ("Zed" should sort last).
    sheet: 'Monday Jan 5',
    room: 'Test Room B',
    timeRange: '3:00p-4:00p',
    cellText: 'A1 : Dancing - Zed',
  },
  {
    // Long details/description text — exercises the card's 4-line-clamp
    // truncation for real (previously only checked via temporary edits that were
    // reverted afterward — see docs/design/dance-schedule.md). Only one " - "
    // (right before the caller name) so parsing isn't ambiguous.
    sheet: 'Monday Jan 5',
    room: 'Test Room C',
    timeRange: '3:00p-4:00p',
    cellText:
      'C1 : Advanced Choreography Workshop: Exploring Symmetric and Asymmetric Formations in Western Square Dance Technique - Test Caller Five',
  },
  {
    // Long/accented name reused in the GCA slot — checks the .gca line's own
    // clamp/rendering, not just .details (GCA credits are exempt from the
    // double-booking check, so reusing François Côté here is fine regardless of
    // his own Test Room B session above).
    sheet: 'Monday Jan 5',
    room: 'Test Room D',
    timeRange: '3:00p-4:00p',
    cellText: 'C4 : Dancing - Test Caller Seven\nGCA: François Côté',
  },
  {
    // The long-name caller from above, this time in a non-adjacent room-spanning
    // session (ROOMS: line, not a ditto mark) — checks how a wide merged card
    // handles long text, not just a normal single-room one.
    sheet: 'Monday Jan 5',
    room: 'Test Room A',
    timeRange: '4:00p-5:00p',
    cellText:
      'MS : Big Group Dance - Alexander Bartholomew Fitzgerald-Montgomery\nROOMS: Test Room A, Test Room D',
  },
  // Early-morning padding, disjoint from the rest of the day's content, purely
  // so these two callers clear MIN_CALLER_HOURS (3, computeDanceScheduleCallerLayout.ts)
  // and actually get a column on /dance-by-caller — without this, no caller in
  // this whole fixture ever clears that threshold (true before these additions
  // too), so the page renders empty and the accented/short names above have no
  // visual home there.
  {
    sheet: 'Monday Jan 5',
    room: 'Test Room A',
    timeRange: '7:00a-9:00a',
    cellText: 'SSD : Dancing - Zed',
  },
  {
    sheet: 'Monday Jan 5',
    room: 'Test Room C',
    timeRange: '7:00a-9:30a',
    cellText: 'MS : Dancing - François Côté',
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

  // Idempotency: skip a (time, room, cellText) combination that's already a row
  // in the sheet — this file's own usage comment above assumes `additions` is a
  // persistent, growing log safe to re-run in full each time, not a one-shot
  // list to prune by hand; without this check, re-running with old entries still
  // present just re-appends duplicate rows (a real double-booking, since a room
  // can't legitimately host two identical sessions at the same time).
  if (roomColumn !== null) {
    let alreadyExists = false
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (
        rowNumber !== 1 &&
        String(row.getCell(1).value) === timeRange &&
        String(row.getCell(roomColumn).value) === cellText
      ) {
        alreadyExists = true
      }
    })
    if (alreadyExists) {
      console.log(`Skipped (already present): ${timeRange} / ${room} / ${cellText}`)
      continue
    }
  }

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
