// One-off script to generate content/test/data/*.xlsx fixtures.
// Run with: node scratch/generate-test-content-set.mjs
// Requires exceljs as a temporary devDependency (pnpm add -D exceljs); remove it
// afterward (pnpm remove exceljs) — the generated .xlsx files are committed, the
// writer library is not a permanent dependency. See docs/design/content-sets.md.
//
// After running this script, validate the output through the *real* parsing
// pipeline by running `pnpm build:test` (or `pnpm dev:test`) — vite-plugin-schedule.ts
// and vite-plugin-dance-schedule.ts will throw a detailed row/column error if
// anything doesn't parse, which is a more authentic check than reimplementing the
// parsers here.

import ExcelJS from 'exceljs'

const eventScheduleRows = [
  ['Date', 'Start time - End time', 'Location', 'Description'],
  ['2026-01-10', '6:00 PM - 7:30 PM', 'Test Hall A', 'Test Event — ISO date, spaced AM/PM'],
  ['1/11/26', '6:00pm-7:30pm', 'Test Hall A', 'Test Event — 2-digit-year slash date, unspaced time'],
  ['January 12, 2026', '18:00 - 19:30', 'Test Hall B', 'Test Event — long-form date, 24-hour time'],
  ['Jan. 13, 2026', '6:00 p.m. - 7:30 p.m.', 'Test Hall B', 'Test Event — abbreviated month with period'],
  ['January 14 2026', '6:00pm to 7:30pm', 'Test Hall A', 'Test Event — long form without comma, "to" separator'],
  ['1/15', '6:00p-7:30p', 'Test Hall C', 'Test Event — ambiguous no-year slash date (year inference)'],
  ['Feb 2', '9:00a-10:00a', 'Test Hall C', 'Test Event — abbreviated no-year long-form date'],
  ['2026-02-03', '6 - 7:30pm', 'Test Hall A', 'Test Event — meridiem inference infers PM for bare start'],
  ['2026-02-04', '11 - 1pm', 'Test Hall A', 'Test Event — meridiem inference flips bare start to AM'],
  ['2026-02-05', '11:00am - 9', 'Test Hall B', 'Test Event — meridiem inference flips bare end to PM'],
  ['2/6/2026', '6:00 PM – 7:30 PM', 'Test Hall D', 'Test Event — en dash time separator'],
  ['2/7/2026', '6:00 PM — 7:30 PM', 'Test Hall D', 'Test Event — em dash time separator'],
]

async function writeEventSchedule() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Schedule')
  for (const row of eventScheduleRows) {
    sheet.addRow(row)
  }
  await workbook.xlsx.writeFile('content/test/data/event-schedule.xlsx')
  console.log('wrote content/test/data/event-schedule.xlsx')
}

const mondaySheet = {
  name: 'Monday Jan 5',
  header: ['Time', 'Test Room A', 'Test Room B', 'Test Room C'],
  rows: [
    ['9:00a-10:00a', 'SSD : Dancing - Test Caller One', null, null],
    [
      '10:00a-11:00a',
      'C4 : Dancing - Test Caller One & Test Caller Two\nROOMS: Test Room A, Test Room C',
      null,
      null,
    ],
    ['11:00a-12:00p', 'Plus : Combined Dance - Test Caller Six', '"', null],
    ['18:00-19:30', 'A1/A2 : Advanced Hothash - Test Caller Three', null, null],
    ['8:00p-9:00p', 'C1 & C2 : Dancing - Test Caller Four\nGCA: Test GCA Person', null, null],
  ],
}

const tuesdaySheet = {
  name: 'Tuesday Jan 6',
  header: ['Time', 'Test Room A', 'Test Room B'],
  rows: [
    ['9:00a-10:30a', 'Various : Open Dancing - Test Caller Five', null],
    ['12:00p-1:30p', null, '* Snack Break\nROOMS: NONE'],
    ['2:00p-3:00p', 'MS : Dancing - Test Caller Seven', null],
  ],
}

async function writeDanceSchedule() {
  const workbook = new ExcelJS.Workbook()
  for (const { name, header, rows } of [mondaySheet, tuesdaySheet]) {
    const sheet = workbook.addWorksheet(name)
    sheet.addRow(header)
    for (const row of rows) {
      sheet.addRow(row)
    }
  }
  await workbook.xlsx.writeFile('content/test/data/dance-schedule.xlsx')
  console.log('wrote content/test/data/dance-schedule.xlsx')
}

await writeEventSchedule()
await writeDanceSchedule()
