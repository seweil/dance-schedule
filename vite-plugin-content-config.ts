import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { parse } from 'yaml'
import type { ContentConfigData, DanceScheduleRoomOrder } from './src/types/contentConfig'

export const CONTENT_CONFIG_VIRTUAL_MODULE_ID = 'virtual:content-config'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + CONTENT_CONFIG_VIRTUAL_MODULE_ID
const CONTENT_CONFIG_FILE_NAME = 'config.yaml'

export interface ContentConfigPluginOptions {
  // Directory (relative to the Vite project root) holding config.yaml for the active
  // content set — e.g. "content/automated-testing" (the set's own root, not its data/ subdir,
  // since config.yaml sits alongside pages/ and data/). See
  // docs/design/content-config.md.
  dataDir: string
}

// true for both — docs/adding-a-new-event.md documents omitting config.yaml
// entirely as producing "sensible defaults," and recommends combining both pairs
// unless an event genuinely needs them split, so the default must match that
// recommendation rather than silently doing the opposite (see docs/known-issues.md's
// now-resolved "combineA1A2 silently defaults to false" item).
const DEFAULT_CONTENT_CONFIG: ContentConfigData = {
  features: { combineA1A2: true, combineC3BC4: true },
}

function readBooleanFeatureFlag(
  configFile: string,
  features: Record<string, unknown>,
  key: 'combineA1A2' | 'combineC3BC4',
): boolean {
  const value = features[key] ?? true
  if (typeof value !== 'boolean') {
    throw new Error(`${configFile}'s "features.${key}" must be a boolean, got ${JSON.stringify(value)}`)
  }
  return value
}

// Shape-only validation — this file has no knowledge of the event's real room
// names (that lives in the separately-parsed dance-schedule.xlsx), so an explicit
// array is only checked for "is it an array of strings" here. Completeness against
// the real room set is a separate, build-time-only cross-check
// (validateRoomOrderConfig, src/lib/deriveRoomOrder.ts) run from
// vite-plugin-dance-schedule.ts, the one place both pieces of data are available.
function readRoomOrder(
  configFile: string,
  danceSchedule: Record<string, unknown>,
): DanceScheduleRoomOrder | undefined {
  const value = danceSchedule.roomOrder
  if (value === undefined) {
    return undefined
  }
  if (value === 'spreadsheet') {
    return value
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value as string[]
  }
  throw new Error(
    `${configFile}'s "danceSchedule.roomOrder" must be the string "spreadsheet" or an array of room names, got ${JSON.stringify(value)}`,
  )
}

export function loadContentConfigData(configFile: string): ContentConfigData {
  if (!fs.existsSync(configFile)) {
    return DEFAULT_CONTENT_CONFIG
  }

  const raw = fs.readFileSync(configFile, 'utf-8')
  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${configFile}: ${message}`, { cause: error })
  }

  const features = ((parsed as Record<string, unknown> | null)?.features ?? {}) as Record<string, unknown>
  const combineA1A2 = readBooleanFeatureFlag(configFile, features, 'combineA1A2')
  const combineC3BC4 = readBooleanFeatureFlag(configFile, features, 'combineC3BC4')

  const danceSchedule = ((parsed as Record<string, unknown> | null)?.danceSchedule ?? {}) as Record<
    string,
    unknown
  >
  const roomOrder = readRoomOrder(configFile, danceSchedule)

  return {
    features: { combineA1A2, combineC3BC4 },
    danceSchedule: roomOrder === undefined ? undefined : { roomOrder },
  }
}

// Resolves virtual:content-config to the active content set's config.yaml — parsed
// feature flags reach client-side code this way (rather than a raw runtime file
// read, which Node fs can't do in the browser bundle), mirroring
// vite-plugin-schedule.ts's schedulePlugin() exactly. See
// docs/design/content-config.md.
export function contentConfigPlugin(options: ContentConfigPluginOptions): Plugin {
  let configFile = path.resolve(process.cwd(), options.dataDir, CONTENT_CONFIG_FILE_NAME)

  return {
    name: 'content-config',
    configResolved(config) {
      configFile = path.resolve(config.root, options.dataDir, CONTENT_CONFIG_FILE_NAME)
    },
    resolveId(id) {
      if (id === CONTENT_CONFIG_VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        this.addWatchFile(configFile)
        const data = loadContentConfigData(configFile)
        return `export default ${JSON.stringify(data)}`
      }
    },
    configureServer(server) {
      server.watcher.add(configFile)
      server.watcher.on('change', (changedFile) => {
        if (path.resolve(changedFile) === configFile) {
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
