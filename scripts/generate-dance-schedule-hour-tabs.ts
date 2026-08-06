// Regenerates the "- Hours by Level"/"- Hours by Caller" summary tabs inside
// content/backtrack2abq/data/dance-schedule.xlsx — static snapshots of the same
// two tables the /debug/dance-schedule page computes and displays
// (computeDanceScheduleHourSummary.ts), so anyone opening the real spreadsheet
// in Excel sees the same totals without visiting the app. The caller table
// omits that page's own 3-hour floor (minCallerHours: 0 below) — every caller
// with any measured hours appears, per direct product decision to keep this
// spreadsheet's version simpler than the debug page's own curated one. GCA
// credit (the `session.gca` field) is never counted toward anyone's hours,
// matching computeDanceScheduleHourSummary's own existing behavior — no extra
// work needed for that. Separately, GCA_CALLER_SHOWCASE_EVENT_TYPE sessions DO
// count (they're a real, if short, calling slot) — the caller table groups
// anyone whose entire credit comes from those slots after everyone else, see
// the `groupBoundary`-driven divider border below.
//
// A permanent, reusable tool (like scripts/edit-test-data.mjs), not a one-off —
// RE-RUN THIS anytime a day's schedule in the workbook changes. These two tabs
// are static values, not live formulas (see docs/design/dance-schedule.md for
// why: the source cells are compound parsed strings, not something a plain
// Excel formula can re-derive) — they go stale otherwise. The "Status" cell
// each tab gets (see writeSummaryTable) is a partial mitigation: a live formula
// that flags when the workbook has been recalculated since this script last
// ran, so a stale re-open at least LOOKS stale rather than silently trusting
// numbers that may no longer match the day sheets.
//
// Both tab names start with "-" so the real build's own parser
// (isNonScheduleSheetName, parseDanceScheduleSheet.ts) treats them as
// non-schedule content and skips them, rather than trying (and failing) to
// parse them as another day's schedule.
//
// Usage: node --import=tsx scripts/generate-dance-schedule-hour-tabs.ts
// (NOT `pnpm exec tsx ...`/the bare `tsx` CLI — its IPC-socket setup fails with
// EPERM in at least one sandboxed environment this was developed in; `node
// --import=tsx` runs the identical transform without that wrapper, including
// resolving this script's own relative .ts imports correctly.)

import ExcelJS from 'exceljs'
import { loadDanceScheduleData } from '../vite-plugin-dance-schedule'
import { buildDanceSchedule } from '../src/lib/buildDanceSchedule'
import {
  computeDanceScheduleHourSummary,
  formatHours,
  type DanceScheduleHourSummaryTable,
} from '../src/lib/computeDanceScheduleHourSummary'

const WORKBOOK_PATH = 'content/backtrack2abq/data/dance-schedule.xlsx'

// Matches RawDanceScheduleTable.tsx's own columnDateFormatter exactly, so a
// date label here reads identically to the debug page's own column headers.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

// Both start with "-" — see this file's own header comment for why.
const LEVEL_SHEET_NAME = '- Hours by Level'
const CALLER_SHEET_NAME = '- Hours by Caller'

// How long after generation the "Status" formula (see writeSummaryTable) waits
// before calling the workbook possibly-stale — deliberately well above the
// script's own real calc-to-`writeFile`-completion gap (milliseconds, at most a
// couple of seconds for a workbook this size) so that gap alone, or a viewer
// opening the file moments after it's generated, never trips a false "modified"
// reading.
const STALENESS_BUFFER_MINUTES = 2

// Excel/Google Sheets dates have no timezone concept at all — a date cell and
// NOW() are both just "whatever the local wall clock said," full stop. ExcelJS
// itself derives a date cell's serial number from a JS Date's *UTC* fields (see
// its own date-handling), which would otherwise silently shift the displayed
// time by this machine's UTC offset. Building the Date from `Date.UTC` with
// THIS machine's own *local* field values makes ExcelJS's UTC-based conversion
// land on the same naive value Excel's own NOW() would show if evaluated here,
// right now — so the "Calculated at" cell and a later live NOW() recalculation
// are comparable, without either one silently drifting by a timezone offset.
// (This is a same-machine-in-practice heuristic, not cross-timezone-exact —
// NOW() recalculated on a DIFFERENT machine in a different timezone reflects
// THAT machine's own local clock, which plain Excel formulas have no way to
// reconcile against without VBA. Acceptable: this spreadsheet is generated and
// edited by the same organizer, typically on the same machine.)
function toExcelLocalSerial(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    ),
  )
}

// No double quotes in either message — they'd need doubling-up to embed safely
// inside the Excel string literals the formula below builds them into.
const FRESH_STATUS = '✓ Up to date as of the Calculated-at time above'
const STALE_STATUS =
  '⚠ Recalculated since Calculated-at — totals may be stale, re-run the generator script'

function writeSummaryTable(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  dates: Date[],
  table: DanceScheduleHourSummaryTable,
  calculatedAt: Date,
) {
  // Idempotency: drop any previous version of this exact sheet before adding a
  // fresh one, rather than depending on ExcelJS's unspecified behavior for a
  // duplicate-name addWorksheet call. Exact-name removal only — deliberately
  // NOT "remove anything '-'-prefixed," which could delete an unrelated
  // utility tab someone else added by hand; that broader rule belongs only to
  // the parser's own skip check (isNonScheduleSheetName), not this script.
  const existing = workbook.getWorksheet(sheetName)
  if (existing) {
    workbook.removeWorksheet(existing.id)
  }

  const sheet = workbook.addWorksheet(sheetName)
  const columnLabels = table.columns.map((column) => column.label)
  const header = ['Date', ...columnLabels, 'Total']
  const headerRow = sheet.addRow(header)
  headerRow.font = { bold: true }

  const dateRows = dates.map((date, dateIndex) =>
    sheet.addRow([
      dateFormatter.format(date),
      // Rounded to formatHours' own 2-decimal convention before writing — a
      // caller/level share like a 3-way split of one hour stores as exactly
      // 0.33, and (just as importantly) a share that's conceptually a whole
      // number stores as an exact integer rather than e.g.
      // 0.9999999999999999, which is what previously left a dangling "1."
      // once numFmt rounded it for display but didn't collapse the decimal
      // point itself.
      ...table.columns.map((column) => Number(formatHours(column.hoursByDate[dateIndex]!))),
      Number(formatHours(table.totalByDate[dateIndex]!)),
    ]),
  )

  const totalRow = sheet.addRow([
    'Total',
    ...table.columns.map((column) => Number(formatHours(column.total))),
    Number(formatHours(table.grandTotal)),
  ])
  totalRow.font = { bold: true }

  // A divider between the "headline" caller columns and the trailing
  // GCA-showcase-only ones (see DanceScheduleHourSummaryTable's own
  // `groupBoundary` doc comment) — undefined on the level table, and on the
  // caller table whenever every included caller falls in just one of the two
  // groups (nothing to divide). `groupBoundary` counts leading headline
  // columns; column 1 is "Date", so its last headline column sits at sheet
  // column `groupBoundary + 1`.
  if (table.groupBoundary !== undefined) {
    const dividerColumnIndex = table.groupBoundary + 1
    for (const row of [headerRow, ...dateRows, totalRow]) {
      row.getCell(dividerColumnIndex).border = { right: { style: 'medium' } }
    }
  }

  sheet.addRow([])
  sheet.addRow([
    `Generated by scripts/generate-dance-schedule-hour-tabs.ts — re-run after editing any day's schedule.`,
  ])

  const calculatedAtRow = sheet.addRow(['Calculated at:', toExcelLocalSerial(calculatedAt)])
  calculatedAtRow.getCell(2).numFmt = 'm/d/yyyy h:mm AM/PM'
  const calculatedAtCellRef = calculatedAtRow.getCell(2).address

  // NOW() is volatile — Excel/Sheets recalculate it (and everything else)
  // whenever ANY cell in the workbook is edited, not just on open, so this
  // stays accurate as the workbook is used, not just at generation time. The
  // `result` seeds the cached display value ExcelJS itself can't compute
  // (ExcelJS writes formula text only) — accurate for the moment this script
  // runs, since NOW() can't yet have drifted past `calculatedAt` by the
  // buffer.
  const statusRow = sheet.addRow(['Status:'])
  statusRow.getCell(2).value = {
    formula: `IF(NOW()>${calculatedAtCellRef}+TIME(0,${STALENESS_BUFFER_MINUTES},0),"${STALE_STATUS}","${FRESH_STATUS}")`,
    result: FRESH_STATUS,
  }

  // Every hour column (everything after Date) — matches formatHours' own "≤2
  // decimals, no trailing zeros" display convention. Values are now already
  // rounded to that same precision when written (see dateRows/totalRow
  // above), so this numFmt only ever formats already-clean numbers.
  for (let columnIndex = 2; columnIndex <= header.length; columnIndex++) {
    sheet.getColumn(columnIndex).numFmt = '0.##'
  }
}

async function main() {
  const sessionData = await loadDanceScheduleData(WORKBOOK_PATH)
  const sessions = buildDanceSchedule(sessionData)
  const summary = computeDanceScheduleHourSummary(sessions, { minCallerHours: 0 })
  const calculatedAt = new Date()

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(WORKBOOK_PATH)

  writeSummaryTable(workbook, LEVEL_SHEET_NAME, summary.dates, summary.levels, calculatedAt)
  writeSummaryTable(workbook, CALLER_SHEET_NAME, summary.dates, summary.callers, calculatedAt)

  await workbook.xlsx.writeFile(WORKBOOK_PATH)
  console.log(`Saved ${WORKBOOK_PATH} with "${LEVEL_SHEET_NAME}"/"${CALLER_SHEET_NAME}" tabs.`)
}

await main()
