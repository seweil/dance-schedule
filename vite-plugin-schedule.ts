import path from 'node:path'
import type { Plugin } from 'vite'
import { readSheet, type Schema } from 'read-excel-file/node'
import { parseEventDate } from './src/lib/parseEventDate'
import { parseTimeRange } from './src/lib/parseTimeRange'
import type { ScheduleEventData } from './src/types/schedule'

export const SCHEDULE_VIRTUAL_MODULE_ID = 'virtual:schedule'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + SCHEDULE_VIRTUAL_MODULE_ID
const SCHEDULE_FILE_RELATIVE_PATH = 'data/event-schedule.xlsx'

interface RawScheduleRow {
  date: Date
  timeRange: string
  location: string
  description: string
}

const schema: Schema<RawScheduleRow> = {
  date: { column: 'Date', type: parseEventDate, required: true },
  timeRange: { column: 'Start time - End time', type: String, required: true },
  location: { column: 'Location', type: String, required: true },
  description: { column: 'Description', type: String, required: true },
}

async function loadScheduleData(scheduleFile: string): Promise<ScheduleEventData[]> {
  const { objects, errors } = await readSheet<RawScheduleRow>(scheduleFile, { schema })

  if (errors && errors.length > 0) {
    const details = errors
      .map((error) => `row ${error.row}, column "${error.column}": ${error.error}`)
      .join('\n')
    throw new Error(`Failed to parse ${scheduleFile}:\n${details}`)
  }

  const rows = objects ?? []
  const timeRangeErrors: string[] = []
  const events: ScheduleEventData[] = []

  for (const row of rows) {
    try {
      const { startTime, endTime } = parseTimeRange(row.timeRange, row.date)
      events.push({
        date: row.date.toISOString(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        location: row.location,
        description: row.description,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      timeRangeErrors.push(`"${row.timeRange}" (${row.location}, ${row.description}): ${message}`)
    }
  }

  if (timeRangeErrors.length > 0) {
    throw new Error(
      `Failed to parse time ranges in ${scheduleFile}:\n${timeRangeErrors.join('\n')}`,
    )
  }

  return events
}

// Resolves virtual:schedule to the schedule data parsed from data/event-schedule.xlsx at
// build time, so the client bundle never sees the raw spreadsheet or a parsing library.
// Watches the source file so pnpm dev picks up edits like content hot-reloads today.
export function schedulePlugin(): Plugin {
  let scheduleFile = path.resolve(process.cwd(), SCHEDULE_FILE_RELATIVE_PATH)

  return {
    name: 'schedule',
    configResolved(config) {
      scheduleFile = path.resolve(config.root, SCHEDULE_FILE_RELATIVE_PATH)
    },
    resolveId(id) {
      if (id === SCHEDULE_VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },
    async load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        this.addWatchFile(scheduleFile)
        const events = await loadScheduleData(scheduleFile)
        return `export default ${JSON.stringify(events)}`
      }
    },
    configureServer(server) {
      server.watcher.add(scheduleFile)
      server.watcher.on('change', (changedFile) => {
        if (path.resolve(changedFile) === scheduleFile) {
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
