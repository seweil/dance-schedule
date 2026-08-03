import path from 'node:path'
import fs from 'node:fs/promises'
import type { Plugin } from 'vite'
import readExcelFile from 'read-excel-file/node'
import { parseDanceScheduleSheet } from './src/lib/parseDanceScheduleSheet'
import { buildDanceSchedule } from './src/lib/buildDanceSchedule'
import { formatDanceScheduleMarkdown } from './src/lib/formatDanceScheduleMarkdown'
import { validateRoomOrderConfig } from './src/lib/deriveRoomOrder'
import { loadContentConfigData } from './vite-plugin-content-config'
import type { DanceSessionData } from './src/types/danceSchedule'

export const DANCE_SCHEDULE_VIRTUAL_MODULE_ID = 'virtual:dance-schedule'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + DANCE_SCHEDULE_VIRTUAL_MODULE_ID
const DANCE_SCHEDULE_FILE_NAME = 'dance-schedule.xlsx'
const DANCE_SCHEDULE_DUMP_FILE_NAME = 'dance-schedule-dump.md'
const CONTENT_CONFIG_FILE_NAME = 'config.yaml'

export interface DanceSchedulePluginOptions {
  // Directory (relative to the Vite project root) holding dance-schedule.xlsx (and
  // where dance-schedule-dump.md is (re)written) for the active content set — e.g.
  // "content/automated-testing/data". See docs/design/content-sets.md.
  dataDir: string
  // The content set's own root (sibling of dataDir, holds config.yaml) — needed
  // only to cross-check danceSchedule.roomOrder (if set) against this file's own
  // room names; see validateRoomOrderConfig below. Same value contentConfigPlugin
  // itself receives as its own dataDir. See docs/design/content-config.md.
  contentDir: string
}

async function loadDanceScheduleData(danceScheduleFile: string): Promise<DanceSessionData[]> {
  // Reads every sheet (one per day) via the default export — this file's matrix
  // shape (rooms as columns, time slots as rows) doesn't fit read-excel-file's
  // row-per-object schema model, so we get the raw grid and parse it ourselves.
  const sheets = await readExcelFile(danceScheduleFile)

  const sessions: DanceSessionData[] = []
  const errors: string[] = []

  for (const sheet of sheets) {
    const result = parseDanceScheduleSheet(sheet.sheet, sheet.data)
    sessions.push(...result.sessions)
    errors.push(...result.errors)
  }

  if (errors.length > 0) {
    const details = errors.map((error) => `  ${error}`).join('\n\n')
    throw new Error(
      `Failed to parse ${danceScheduleFile} — ${errors.length} error(s):\n\n${details}`,
    )
  }

  return sessions
}

// Resolves virtual:dance-schedule to the data parsed from
// <dataDir>/dance-schedule.xlsx at build time — mirrors vite-plugin-schedule.ts's
// schedulePlugin() (build-time only, watches the source file in dev), extended to
// read every sheet in the file rather than a single schema-mapped one.
export function danceSchedulePlugin(options: DanceSchedulePluginOptions): Plugin {
  let danceScheduleFile = path.resolve(process.cwd(), options.dataDir, DANCE_SCHEDULE_FILE_NAME)
  let danceScheduleDumpFile = path.resolve(
    process.cwd(),
    options.dataDir,
    DANCE_SCHEDULE_DUMP_FILE_NAME,
  )
  let contentConfigFile = path.resolve(process.cwd(), options.contentDir, CONTENT_CONFIG_FILE_NAME)

  return {
    name: 'dance-schedule',
    configResolved(config) {
      danceScheduleFile = path.resolve(config.root, options.dataDir, DANCE_SCHEDULE_FILE_NAME)
      danceScheduleDumpFile = path.resolve(
        config.root,
        options.dataDir,
        DANCE_SCHEDULE_DUMP_FILE_NAME,
      )
      contentConfigFile = path.resolve(config.root, options.contentDir, CONTENT_CONFIG_FILE_NAME)
    },
    resolveId(id) {
      if (id === DANCE_SCHEDULE_VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },
    async load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        this.addWatchFile(danceScheduleFile)
        this.addWatchFile(contentConfigFile)
        const sessions = await loadDanceScheduleData(danceScheduleFile)
        const builtSessions = buildDanceSchedule(sessions)

        // Cross-check an explicit danceSchedule.roomOrder (content/<set>/config.yaml)
        // against this file's own room names — the one place both are available at
        // once. See docs/design/content-config.md and validateRoomOrderConfig's own
        // comment for why this can't live inside contentConfigPlugin itself.
        const contentConfig = loadContentConfigData(contentConfigFile)
        validateRoomOrderConfig(builtSessions, contentConfig.danceSchedule?.roomOrder, contentConfigFile)

        // Debug output: a normalized, human-readable dump of how the spreadsheet was
        // interpreted, regenerated on every parse so it's always in sync — committed
        // to the repo so a spreadsheet change shows up as a reviewable diff.
        const markdown = formatDanceScheduleMarkdown(builtSessions)
        await fs.writeFile(danceScheduleDumpFile, markdown + '\n')

        return `export default ${JSON.stringify(sessions)}`
      }
    },
    configureServer(server) {
      server.watcher.add(danceScheduleFile)
      server.watcher.add(contentConfigFile)
      server.watcher.on('change', (changedFile) => {
        const resolved = path.resolve(changedFile)
        if (resolved === danceScheduleFile || resolved === contentConfigFile) {
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
