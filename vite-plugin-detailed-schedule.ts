import path from 'node:path'
import type { Plugin } from 'vite'
import readExcelFile from 'read-excel-file/node'
import { parseDetailedScheduleSheet } from './src/lib/parseDetailedScheduleSheet'
import type { DetailedSessionData } from './src/types/detailedSchedule'

export const DETAILED_SCHEDULE_VIRTUAL_MODULE_ID = 'virtual:detailed-schedule'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + DETAILED_SCHEDULE_VIRTUAL_MODULE_ID
const DETAILED_SCHEDULE_FILE_RELATIVE_PATH = 'data/detailed-schedule.xlsx'

async function loadDetailedScheduleData(detailedScheduleFile: string): Promise<DetailedSessionData[]> {
  // Reads every sheet (one per day) via the default export — this file's matrix
  // shape (rooms as columns, time slots as rows) doesn't fit read-excel-file's
  // row-per-object schema model, so we get the raw grid and parse it ourselves.
  const sheets = await readExcelFile(detailedScheduleFile)

  const sessions: DetailedSessionData[] = []
  const errors: string[] = []

  for (const sheet of sheets) {
    const result = parseDetailedScheduleSheet(sheet.sheet, sheet.data)
    sessions.push(...result.sessions)
    errors.push(...result.errors)
  }

  if (errors.length > 0) {
    const details = errors.map((error) => `  ${error}`).join('\n\n')
    throw new Error(
      `Failed to parse ${detailedScheduleFile} — ${errors.length} error(s):\n\n${details}`,
    )
  }

  return sessions
}

// Resolves virtual:detailed-schedule to the data parsed from
// data/detailed-schedule.xlsx at build time — mirrors vite-plugin-schedule.ts's
// schedulePlugin() (build-time only, watches the source file in dev), extended to
// read every sheet in the file rather than a single schema-mapped one.
export function detailedSchedulePlugin(): Plugin {
  let detailedScheduleFile = path.resolve(process.cwd(), DETAILED_SCHEDULE_FILE_RELATIVE_PATH)

  return {
    name: 'detailed-schedule',
    configResolved(config) {
      detailedScheduleFile = path.resolve(config.root, DETAILED_SCHEDULE_FILE_RELATIVE_PATH)
    },
    resolveId(id) {
      if (id === DETAILED_SCHEDULE_VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },
    async load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        this.addWatchFile(detailedScheduleFile)
        const sessions = await loadDetailedScheduleData(detailedScheduleFile)
        return `export default ${JSON.stringify(sessions)}`
      }
    },
    configureServer(server) {
      server.watcher.add(detailedScheduleFile)
      server.watcher.on('change', (changedFile) => {
        if (path.resolve(changedFile) === detailedScheduleFile) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID)
          if (mod) {
            server.moduleGraph.invalidateModule(mod)
          }
          server.ws.send({ type: 'full-reload' })
        }
      })
    },
  }
}
