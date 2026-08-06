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
// RE-RUN THIS anytime a day's schedule in the workbook changes. The hour data
// itself is static values, not live formulas (see docs/design/dance-schedule.md
// for why: the source cells are compound parsed strings, not something a plain
// Excel formula can re-derive) — it goes stale otherwise. Each tab's footer
// (see writeSummaryTable) is a partial mitigation: a "Saved" cell that's a
// live `=NOW()` formula, seeded to read as this script's own save time until
// something in the workbook actually changes, plus a "Status" cell comparing
// it against the fixed "Calculated" time — so a workbook edited after this
// script ran at least LOOKS stale rather than silently trusting numbers that
// may no longer match the day sheets.
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

// Level codes (SSD, A1, C3A, …) are all short — see applyColumnWidths' own
// comment on why a flat width (rather than per-label sizing) both looks more
// balanced across this particular sheet's row and comfortably fits the
// footer's own date/time cells, which per-label sizing would otherwise leave
// too narrow here.
const LEVEL_SHEET_COLUMN_WIDTH = 10

// Date and time shown in separate cells/columns (see writeSummaryTable's
// timestamp rows), not one combined "m/d/yyyy h:mm:ss AM/PM" cell — the
// combined string was wide enough to get truncated by the hour columns'
// narrow default width. Applying both formats to the SAME underlying
// datetime value works fine: Excel's non-bracketed time format codes show
// only the time-of-day portion (value mod 1) regardless of the date part
// also present in that same value, so the date-only and time-only cells
// below can share one value/formula each and just look different.
const DATE_NUM_FMT = 'm/d/yyyy'
const TIME_NUM_FMT = 'h:mm:ss AM/PM'

// How far the live "Saved" cell (see writeSummaryTable) is allowed to drift
// past "Calculated" before the "Status" formula calls the workbook
// possibly-stale. Both are seeded from timestamps captured moments apart in
// main(), well before the real `workbook.xlsx.writeFile` call actually
// finishes hitting disk — this only needs to cover that remaining gap
// (milliseconds in practice for a workbook this size), not any real editing
// session, since "Saved" only moves again once an actual edit forces a
// recalculation (see writeSummaryTable's own comment on why). NOT minutes: an
// earlier, mistaken version of this measured a multi-minute buffer directly
// against plain `NOW()`, which meant simply having the file open a while
// (with zero edits) was enough to trip it — see this constant's git history.
const STALENESS_GRACE_SECONDS = 15

// Excel/Google Sheets dates have no timezone concept at all — a date cell and
// NOW() are both just "whatever the local wall clock said," full stop. ExcelJS
// itself derives a date cell's serial number from a JS Date's *UTC* fields (see
// its own date-handling), which would otherwise silently shift the displayed
// time by this machine's UTC offset. Building a Date from `Date.UTC` with THIS
// machine's own *local* field values makes ExcelJS's UTC-based conversion land
// on the same naive value Excel's own NOW() would show if evaluated here,
// right now — so a literal timestamp cell and a later live NOW() recalculation
// are comparable, without either one silently drifting by a timezone offset.
// (This is a same-machine-in-practice heuristic, not cross-timezone-exact —
// NOW() recalculated on a DIFFERENT machine in a different timezone reflects
// THAT machine's own local clock, which plain Excel formulas have no way to
// reconcile against without VBA. Acceptable: this spreadsheet is generated and
// edited by the same organizer, typically on the same machine.)
function naiveUtcMillis(date: Date): number {
  return Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  )
}

function toExcelLocalSerial(date: Date): Date {
  return new Date(naiveUtcMillis(date))
}

// Days between the Excel/1900-date-system epoch (1899-12-30) and the Unix
// epoch (1970-01-01) — the standard constant for converting to a raw Excel
// serial number, needed below to seed a *formula* cell's cached result (which
// XLSX stores as a plain number, unlike a literal date cell's value, which
// ExcelJS itself converts from a JS Date automatically).
const EXCEL_SERIAL_EPOCH_OFFSET_DAYS = 25569

function toExcelSerialNumber(date: Date): number {
  return naiveUtcMillis(date) / 86_400_000 + EXCEL_SERIAL_EPOCH_OFFSET_DAYS
}

// No double quotes in either message — they'd need doubling-up to embed safely
// inside the Excel string literals the formula below builds them into.
const FRESH_STATUS = '✓ Up to date as of Saved'
const STALE_STATUS = '⚠ Recalculated since Saved — totals may be stale, re-run the generator script'

const CALCULATED_LABEL = 'Calculated'
const SAVED_LABEL = 'Saved'
const STATUS_LABEL = 'Status'

// ExcelJS has no true "autofit" (that needs actual font-metric rendering,
// which only a real spreadsheet app does at open time) — this is the
// standard workaround: size each column to its own widest known text plus
// padding, so a caller column comfortably fits that caller's own name rather
// than truncating it at Excel's ~8.43-character default. NOT based on
// scanning every cell's own `cell.text`: ExcelJS's `.text` getter doesn't
// apply a numFmt to a literal Date value (it falls back to the JS Date's own
// enormous `.toString()`, e.g. "Thu Aug 06 2026 08:57:52 GMT-0700 (Pacific
// Daylight Time)"), which would badly over-widen the "Calculated"/"Saved"
// date/time columns — confirmed live, not a hypothetical.
//
// Two modes, chosen per sheet by the caller:
// - `'fit-label'` (the caller table): every data column (2..header.length)
//   is sized from its own header label alone, since a caller name is always
//   this script's widest content in that column — the footer's own
//   "8/6/2026"/"3:52:12 PM" values are always shorter than a real name.
//   Column 1 ("Date") is the one exception needing several candidates,
//   since it also holds the per-day date labels and the footer's own row
//   labels, any of which can be longer than "Date" itself.
// - a flat number (the level table): level codes (SSD, A1, C3A, …) are all
//   short enough that per-label widths would come out jagged and, worse,
//   narrower than the footer's own "Calculated"/"Saved" date/time cells
//   sharing those same columns (label-based sizing there assumed a
//   caller/level name is always the widest thing in its column — true for
//   names, false for 2-3-character level codes). One flat width sized for
//   the widest date/time string in the footer looks visually balanced
//   across the whole row AND comfortably fits every cell.
function applyColumnWidths(
  sheet: ExcelJS.Worksheet,
  header: string[],
  dates: Date[],
  mode: 'fit-label' | number,
) {
  if (typeof mode === 'number') {
    for (let columnIndex = 1; columnIndex <= header.length; columnIndex++) {
      sheet.getColumn(columnIndex).width = mode
    }
    return
  }
  header.forEach((label, index) => {
    sheet.getColumn(index + 1).width = label.length + 3
  })
  const column1Candidates = [
    ...header.slice(0, 1),
    CALCULATED_LABEL,
    SAVED_LABEL,
    STATUS_LABEL,
    ...dates.map((date) => dateFormatter.format(date)),
  ]
  sheet.getColumn(1).width = Math.max(...column1Candidates.map((label) => label.length)) + 3
}

function writeSummaryTable(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  dates: Date[],
  table: DanceScheduleHourSummaryTable,
  calculatedAt: Date,
  savedAt: Date,
  columnWidthMode: 'fit-label' | number,
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
  applyColumnWidths(sheet, header, dates, columnWidthMode)

  const dateRows = dates.map((date, dateIndex) =>
    sheet.addRow([
      dateFormatter.format(date),
      // Rounded to formatHours' own 2-decimal convention before writing — a
      // caller/level share like a 3-way split of one hour stores as exactly
      // 0.33, and (just as importantly) a share that's conceptually a whole
      // number stores as an exact integer rather than e.g.
      // 0.9999999999999999.
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

  // Every hour column (everything after Date) — matches formatHours' own "≤2
  // decimals, no trailing zeros" display convention, which the values are
  // already rounded to above. Deliberately 'General', not a custom pattern
  // like '0.##': Google Sheets (unlike Excel) renders a custom format with
  // only OPTIONAL decimal placeholders as a dangling "5." for a value that's
  // exactly a whole number — a real, observed rendering bug in that app, not
  // a stored-precision issue (the previous version of this file rounded the
  // stored value, which fixed Excel but not this). 'General' has no such
  // quirk in either app, and needs no help now that the stored values
  // themselves are already clean. This MUST run before the footer/timestamp
  // rows are added below: ExcelJS's `column.numFmt` backfills every cell
  // that already exists in that column at the moment it's set, which would
  // otherwise clobber the very different date/time format those cells need.
  for (let columnIndex = 2; columnIndex <= header.length; columnIndex++) {
    sheet.getColumn(columnIndex).numFmt = 'General'
  }

  sheet.addRow([])

  // "Calculated" is a plain literal — a fixed snapshot of when this script
  // computed the numbers above. Both its date and time cells hold the exact
  // same underlying value; only their numFmt differs (see DATE_NUM_FMT's own
  // comment on why that's safe).
  const calculatedRow = sheet.addRow([
    CALCULATED_LABEL,
    toExcelLocalSerial(calculatedAt),
    toExcelLocalSerial(calculatedAt),
  ])
  calculatedRow.getCell(2).numFmt = DATE_NUM_FMT
  calculatedRow.getCell(3).numFmt = TIME_NUM_FMT
  const calculatedAtCellRef = calculatedRow.getCell(3).address

  // "Saved" is a live `=NOW()` FORMULA in both cells, not a literal, each
  // seeded with a cached result equal to when the script wrote this file —
  // so it reads the same as "Calculated" until something actually changes.
  // That's the point: `NOW()` only recalculates when Excel/Sheets actually
  // recalculate the workbook, which (in real Excel, with automatic
  // calculation, the default) happens on every EDIT, not on every open — a
  // file with cached formula results just shows those cached results until
  // something is actually touched. So a user manually editing a day's
  // schedule after this script ran will cause "Saved" to visibly jump
  // forward to that edit's own time, live, without re-running the generator —
  // exactly the signal the Status formula below needs. (Google Sheets is a
  // known exception: unlike Excel, it recalculates volatile functions like
  // NOW() on every open regardless of cached results, so "Saved" — and
  // therefore Status — can read as stale there just from opening the file
  // well after it was generated, even with zero edits. No plain formula can
  // fix that; it's a real platform gap, not a bug in this script.)
  const savedRow = sheet.addRow([SAVED_LABEL])
  const savedDateCell = savedRow.getCell(2)
  savedDateCell.value = { formula: 'NOW()', result: toExcelSerialNumber(savedAt) }
  savedDateCell.numFmt = DATE_NUM_FMT
  const savedTimeCell = savedRow.getCell(3)
  savedTimeCell.value = { formula: 'NOW()', result: toExcelSerialNumber(savedAt) }
  savedTimeCell.numFmt = TIME_NUM_FMT
  const savedAtCellRef = savedTimeCell.address

  // Compares the live "Saved" cell (see above) against the fixed
  // "Calculated" snapshot, with a grace period covering the small, genuine
  // gap between `savedAt` (captured just before this script starts writing
  // sheet content) and the real `workbook.xlsx.writeFile` call actually
  // finishing — milliseconds in practice for a workbook this size. Either
  // cell's own value already carries the full date+time, regardless of which
  // one its numFmt happens to display, so comparing the two "time" cells is
  // still a full, correct datetime comparison. `result` seeds the cached
  // display ExcelJS itself can't compute (it writes formula text only) —
  // accurate for the moment this script runs, since "Saved" can't yet have
  // drifted from "Calculated" by more than the grace period.
  const statusRow = sheet.addRow([STATUS_LABEL])
  statusRow.getCell(2).value = {
    formula: `IF(${savedAtCellRef}>${calculatedAtCellRef}+TIME(0,0,${STALENESS_GRACE_SECONDS}),"${STALE_STATUS}","${FRESH_STATUS}")`,
    result: FRESH_STATUS,
  }

  sheet.addRow([
    `Generated by scripts/generate-dance-schedule-hour-tabs.ts — re-run after editing any day's schedule.`,
  ])
}

async function main() {
  const sessionData = await loadDanceScheduleData(WORKBOOK_PATH)
  const sessions = buildDanceSchedule(sessionData)
  const summary = computeDanceScheduleHourSummary(sessions, { minCallerHours: 0 })
  const calculatedAt = new Date()

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(WORKBOOK_PATH)
  const savedAt = new Date()

  writeSummaryTable(
    workbook,
    LEVEL_SHEET_NAME,
    summary.dates,
    summary.levels,
    calculatedAt,
    savedAt,
    LEVEL_SHEET_COLUMN_WIDTH,
  )
  writeSummaryTable(
    workbook,
    CALLER_SHEET_NAME,
    summary.dates,
    summary.callers,
    calculatedAt,
    savedAt,
    'fit-label',
  )

  await workbook.xlsx.writeFile(WORKBOOK_PATH)
  console.log(`Saved ${WORKBOOK_PATH} with "${LEVEL_SHEET_NAME}"/"${CALLER_SHEET_NAME}" tabs.`)
}

await main()
