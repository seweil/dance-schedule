import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { parse } from 'yaml'
import {
  WEEKDAYS,
  type ContentConfigData,
  type ContentFeatures,
  type DanceScheduleConfig,
  type DanceScheduleRoomOrder,
  type Weekday,
} from './src/types/contentConfig'

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
  key: keyof ContentFeatures,
  defaultValue = true,
): boolean {
  // Only a genuinely absent key (undefined) gets the default — an explicit
  // `null` (e.g. a key present but left blank mid-edit) falls through to the
  // type check below and throws, the same as any other wrong-typed value,
  // rather than silently taking the default too.
  const value = features[key] === undefined ? defaultValue : features[key]
  if (typeof value !== 'boolean') {
    throw new Error(`${configFile}'s "features.${key}" must be a boolean, got ${JSON.stringify(value)}`)
  }
  return value
}

// Validates a top-level config.yaml section (e.g. `features:`, `danceSchedule:`)
// is actually a YAML mapping before treating it as one — a scalar value where a
// nested section was expected (e.g. a forgotten indent) would otherwise silently
// index as `undefined` on every key lookup and fall through to defaults with no
// error at all.
function asConfigSection(configFile: string, sectionName: string, value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {}
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${configFile}'s "${sectionName}" must be a mapping, got ${JSON.stringify(value)}`)
  }
  return value as Record<string, unknown>
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

// Shape-only, like readRoomOrder above — whether each name is really in the
// schedule is a build-time cross-check in vite-plugin-dance-schedule.ts.
function readFeaturedStaff(configFile: string, danceSchedule: Record<string, unknown>): string[] | undefined {
  const value = danceSchedule.featuredStaff
  if (value === undefined) {
    return undefined
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((name) => typeof name !== 'string' || name.trim() === '')
  ) {
    throw new Error(
      `${configFile}'s "danceSchedule.featuredStaff" must be a non-empty list of names, got ${JSON.stringify(value)}`,
    )
  }
  return value.map((name: string) => name.trim())
}

// Shape-only, like the two above — whether the schedule has exactly one date on
// that weekday is a build-time cross-check in vite-plugin-dance-schedule.ts.
// Case-insensitive, normalized to the capitalized name.
function readDefaultDay(configFile: string, danceSchedule: Record<string, unknown>): Weekday | undefined {
  const value = danceSchedule.defaultDay
  if (value === undefined) {
    return undefined
  }
  const day =
    typeof value === 'string' ? WEEKDAYS.find((weekday) => weekday.toLowerCase() === value.trim().toLowerCase()) : undefined
  if (day === undefined) {
    throw new Error(
      `${configFile}'s "danceSchedule.defaultDay" must be a weekday name such as "Friday", got ${JSON.stringify(value)}`,
    )
  }
  return day
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

// The `danceSchedule` section, for the build-time-only keys below. Undefined when
// config.yaml itself is absent.
function readDanceScheduleSection(configFile: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(configFile)) {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = parse(fs.readFileSync(configFile, 'utf-8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${configFile}: ${message}`, { cause: error })
  }
  return asConfigSection(configFile, 'danceSchedule', (parsed as Record<string, unknown> | null)?.danceSchedule)
}

// `danceSchedule.format` — which parser (dance-schedule-parsers/index.ts) reads
// this set's dance schedule. Build-time only, so deliberately not part of
// ContentConfigData / virtual:content-config: the client never needs it.
// Undefined when the file or key is absent; the registry applies the default and
// rejects an unknown value (this file has no knowledge of which formats exist).
export function loadDanceScheduleFormat(configFile: string): string | undefined {
  const value = readDanceScheduleSection(configFile)?.format
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${configFile}'s "danceSchedule.format" must be a non-empty string, got ${JSON.stringify(value)}`)
  }
  return value.trim()
}

// `danceSchedule.programStaff` — staff to credit on a pdf-program-grid session
// whose own cell names nobody, keyed by program header, e.g.
// `{ Clogging: [Trevor DeWitt] }` for an instructor the PDF never names (see
// docs/design/midwinter-festival-2027.md). Build-time only, like `format`.
export function loadDanceScheduleProgramStaff(configFile: string): Record<string, string[]> {
  const danceSchedule = readDanceScheduleSection(configFile)
  if (danceSchedule === undefined) {
    return {}
  }
  const programStaff = asConfigSection(configFile, 'danceSchedule.programStaff', danceSchedule.programStaff)
  const result: Record<string, string[]> = {}
  for (const [program, names] of Object.entries(programStaff)) {
    if (!Array.isArray(names) || names.some((name) => typeof name !== 'string' || name.trim() === '')) {
      throw new Error(
        `${configFile}'s "danceSchedule.programStaff.${program}" must be a list of names, got ${JSON.stringify(names)}`,
      )
    }
    result[program] = names.map((name: string) => name.trim())
  }
  return result
}

// `danceSchedule.staffAliases` — one person printed under more than one name in a
// pdf-program-grid PDF, each other spelling mapped to the one to show, e.g.
// `{ Mike Kious: Michael Kious }`. Build-time only, like `format`.
export function loadDanceScheduleStaffAliases(configFile: string): Record<string, string> {
  const danceSchedule = readDanceScheduleSection(configFile)
  if (danceSchedule === undefined) {
    return {}
  }
  const staffAliases = asConfigSection(configFile, 'danceSchedule.staffAliases', danceSchedule.staffAliases)
  const result: Record<string, string> = {}
  for (const [alias, name] of Object.entries(staffAliases)) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(`${configFile}'s "danceSchedule.staffAliases.${alias}" must be a name, got ${JSON.stringify(name)}`)
    }
    result[alias.trim()] = name.trim()
  }
  return result
}

export function loadContentConfigData(configFile: string): ContentConfigData {
  let combineA1A2 = true
  let combineC3BC4 = true
  let combineAdvancedC1 = false
  let roomOrder: DanceScheduleRoomOrder | undefined
  let featuredStaff: string[] | undefined
  let defaultDay: Weekday | undefined

  if (fs.existsSync(configFile)) {
    const raw = fs.readFileSync(configFile, 'utf-8')
    let parsed: unknown
    try {
      parsed = parse(raw)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to parse ${configFile}: ${message}`, { cause: error })
    }

    const features = asConfigSection(configFile, 'features', (parsed as Record<string, unknown> | null)?.features)
    combineA1A2 = readBooleanFeatureFlag(configFile, features, 'combineA1A2')
    combineC3BC4 = readBooleanFeatureFlag(configFile, features, 'combineC3BC4')
    combineAdvancedC1 = readBooleanFeatureFlag(configFile, features, 'combineAdvancedC1', false)

    const danceSchedule = asConfigSection(
      configFile,
      'danceSchedule',
      (parsed as Record<string, unknown> | null)?.danceSchedule,
    )
    roomOrder = readRoomOrder(configFile, danceSchedule)
    featuredStaff = readFeaturedStaff(configFile, danceSchedule)
    defaultDay = readDefaultDay(configFile, danceSchedule)
  }

  // Applied last, after the file-or-default values are fully resolved, so an
  // override works identically whether config.yaml exists, is missing, or
  // simply omits the field being overridden.
  combineA1A2 = readBooleanOverride(COMBINE_A1A2_ENV_VAR, combineA1A2)
  combineC3BC4 = readBooleanOverride(COMBINE_C3BC4_ENV_VAR, combineC3BC4)
  roomOrder = readRoomOrderOverride(roomOrder)

  const danceSchedule: DanceScheduleConfig = {
    ...(roomOrder === undefined ? {} : { roomOrder }),
    ...(featuredStaff === undefined ? {} : { featuredStaff }),
    ...(defaultDay === undefined ? {} : { defaultDay }),
  }
  return {
    features: { combineA1A2, combineC3BC4, combineAdvancedC1 },
    danceSchedule: Object.keys(danceSchedule).length === 0 ? undefined : danceSchedule,
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
