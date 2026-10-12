import path from 'node:path'
import fs from 'node:fs/promises'
import type { Plugin } from 'vite'
import { buildDanceSchedule } from './src/lib/buildDanceSchedule'
import { formatDanceScheduleMarkdown } from './src/lib/formatDanceScheduleMarkdown'
import { validateRoomOrderConfig } from './src/lib/deriveRoomOrder'
import { loadContentConfigData } from './vite-plugin-content-config'
import { loadDanceScheduleData, resolveDanceScheduleSource } from './dance-schedule-parsers'

export const DANCE_SCHEDULE_VIRTUAL_MODULE_ID = 'virtual:dance-schedule'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + DANCE_SCHEDULE_VIRTUAL_MODULE_ID
const DANCE_SCHEDULE_DUMP_FILE_NAME = 'dance-schedule-dump.md'
const CONTENT_CONFIG_FILE_NAME = 'config.yaml'

export interface DanceSchedulePluginOptions {
  // Directory (relative to the Vite project root) where dance-schedule-dump.md is
  // (re)written for the active content set — e.g. "content/automated-testing/data".
  // See docs/design/content-sets.md.
  dataDir: string
  // The content set's own root (sibling of dataDir, holds config.yaml) — which
  // parser and source file to use come from here (resolveDanceScheduleSource),
  // as does danceSchedule.roomOrder for the cross-check below. Same value
  // contentConfigPlugin itself receives as its own dataDir. See
  // docs/design/content-config.md.
  contentDir: string
}

// Resolves virtual:dance-schedule to the sessions parsed (by whichever parser the
// content set's danceSchedule.format selects — see dance-schedule-parsers/) at
// build time — mirrors vite-plugin-schedule.ts's schedulePlugin() (build-time
// only, watches the source file in dev).
export function danceSchedulePlugin(options: DanceSchedulePluginOptions): Plugin {
  let contentDir = path.resolve(process.cwd(), options.contentDir)
  let danceScheduleFile = resolveDanceScheduleSource(contentDir).sourceFile
  let danceScheduleDumpFile = path.resolve(
    process.cwd(),
    options.dataDir,
    DANCE_SCHEDULE_DUMP_FILE_NAME,
  )
  let contentConfigFile = path.resolve(process.cwd(), options.contentDir, CONTENT_CONFIG_FILE_NAME)

  return {
    name: 'dance-schedule',
    configResolved(config) {
      contentDir = path.resolve(config.root, options.contentDir)
      danceScheduleFile = resolveDanceScheduleSource(contentDir).sourceFile
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
        // Re-resolved on every load: an edited danceSchedule.format can point at a
        // different source file than the one resolved at startup.
        danceScheduleFile = resolveDanceScheduleSource(contentDir).sourceFile
        this.addWatchFile(danceScheduleFile)
        this.addWatchFile(contentConfigFile)
        const sessions = await loadDanceScheduleData(contentDir)
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
          if (resolved === contentConfigFile) {
            // A changed danceSchedule.format may name a different source file —
            // start watching it too. An invalid format is left for load() to
            // report as a proper build error rather than thrown from a watcher.
            try {
              server.watcher.add(resolveDanceScheduleSource(contentDir).sourceFile)
            } catch {
              // reported by load() on the reload below
            }
          }
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
