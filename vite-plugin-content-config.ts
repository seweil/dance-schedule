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

const COMBINE_A1A2_ENV_VAR = 'COMBINE_A1A2'
const COMBINE_C3BC4_ENV_VAR = 'COMBINE_C3BC4'
const ROOM_ORDER_ENV_VAR = 'DANCE_SCHEDULE_ROOM_ORDER'

// Dev-only convenience: lets a developer preview a different value than
// whatever the active content set's config.yaml actually has, without
// hand-editing that file (and remembering to revert it) or standing up a
// whole extra content-set directory per permutation to preview — e.g.
// `COMBINE_A1A2=false DANCE_SCHEDULE_ROOM_ORDER=spreadsheet pnpm dev:test`. Read
// via plain `process.env`, mirroring this repo's existing CONTENT_SET/BASE_PATH
// pattern (vite.config.ts) — no dotenv/`.env` file, no custom `import.meta.env`
// var introduced. Unset (the default) means no override at all — every real
// content-set build/test/e2e run leaves these unset, so behavior is
// byte-for-byte unchanged from before this existed. See
// docs/design/content-config.md.
function readBooleanOverride(envVar: string, current: boolean): boolean {
  const raw = process.env[envVar]
  if (raw === undefined) {
    return current
  }
  if (raw === 'true') {
    return true
  }
  if (raw === 'false') {
    return false
  }
  throw new Error(`${envVar} must be "true" or "false", got ${JSON.stringify(raw)}`)
}

// Same convenience as readBooleanOverride above, for danceSchedule.roomOrder —
// a third accepted value, "default", exists here (with no boolean equivalent
// needed) so a developer can force the median-level algorithm even when the
// active set's config.yaml itself sets `spreadsheet` or an explicit list.
function readRoomOrderOverride(current: DanceScheduleRoomOrder | undefined): DanceScheduleRoomOrder | undefined {
  const raw = process.env[ROOM_ORDER_ENV_VAR]
  if (raw === undefined) {
    return current
  }
  if (raw === 'default') {
    return undefined
  }
  if (raw === 'spreadsheet') {
    return raw
  }
  const rooms = raw
    .split(',')
    .map((room) => room.trim())
    .filter((room) => room.length > 0)
  if (rooms.length === 0) {
    throw new Error(
      `${ROOM_ORDER_ENV_VAR} must be "default", "spreadsheet", or a comma-separated room list, got ${JSON.stringify(raw)}`,
    )
  }
  return rooms
}

export function loadContentConfigData(configFile: string): ContentConfigData {
  let combineA1A2 = true
  let combineC3BC4 = true
  let roomOrder: DanceScheduleRoomOrder | undefined

  if (fs.existsSync(configFile)) {
    const raw = fs.readFileSync(configFile, 'utf-8')
    let parsed: unknown
    try {
      parsed = parse(raw)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to parse ${configFile}: ${message}`, { cause: error })
    }

    const features = ((parsed as Record<string, unknown> | null)?.features ?? {}) as Record<string, unknown>
    combineA1A2 = readBooleanFeatureFlag(configFile, features, 'combineA1A2')
    combineC3BC4 = readBooleanFeatureFlag(configFile, features, 'combineC3BC4')

    const danceSchedule = ((parsed as Record<string, unknown> | null)?.danceSchedule ?? {}) as Record<
      string,
      unknown
    >
    roomOrder = readRoomOrder(configFile, danceSchedule)
  }

  // Applied last, after the file-or-default values are fully resolved, so an
  // override works identically whether config.yaml exists, is missing, or
  // simply omits the field being overridden.
  combineA1A2 = readBooleanOverride(COMBINE_A1A2_ENV_VAR, combineA1A2)
  combineC3BC4 = readBooleanOverride(COMBINE_C3BC4_ENV_VAR, combineC3BC4)
  roomOrder = readRoomOrderOverride(roomOrder)

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
