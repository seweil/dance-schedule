import readExcelFile from 'read-excel-file/node'
import { isNonScheduleSheetName, parseDanceScheduleSheet } from '../src/lib/parseDanceScheduleSheet'
import type { SourcedDanceSession } from '../src/lib/validateDanceSessions'
import type { DanceScheduleParser } from './types'

// The original format: an .xlsx workbook with one sheet per day (sheet name =
// date), rooms as columns, time slots as rows, and each cell in the
// `Level : Type - Caller [GCA: Name]` syntax. See docs/design/dance-schedule.md
// and docs/adding-a-new-event.md for the full authoring conventions.
export const roomGridParser: DanceScheduleParser = {
  format: 'room-grid',
  sourceFileName: 'dance-schedule.xlsx',
  description: 'xlsx workbook, one sheet per day, rooms as columns and time slots as rows',
  async parse(sourceFile) {
    // Reads every sheet via the default export — this file's matrix shape doesn't
    // fit read-excel-file's row-per-object schema model, so we get the raw grid
    // and parse it ourselves.
    const sheets = await readExcelFile(sourceFile)
    const sessions: SourcedDanceSession[] = []
    const errors: string[] = []
    for (const sheet of sheets) {
      // Skips any sheet deliberately opted out of day-sheet parsing (see
      // isNonScheduleSheetName's own comment) — e.g. a hand-added notes tab.
      // Every other sheet is still assumed to be a real schedule day.
      if (isNonScheduleSheetName(sheet.sheet)) {
        continue
      }
      const result = parseDanceScheduleSheet(sheet.sheet, sheet.data)
      result.sessions.forEach((session, index) => {
        sessions.push({ session, source: result.sources[index]! })
      })
      errors.push(...result.errors)
    }
    return { sessions, errors }
  },
}
