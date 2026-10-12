import path from 'node:path'
import type { DanceSessionData } from '../src/types/danceSchedule'
import { validateDanceSessions } from '../src/lib/validateDanceSessions'
import { loadDanceScheduleFormat } from '../vite-plugin-content-config'
import { roomGridParser } from './roomGrid'
import type { DanceScheduleParser } from './types'

export type { DanceScheduleParser, DanceScheduleParseResult } from './types'

// Every available input format, keyed by its `danceSchedule.format` value.
export const DANCE_SCHEDULE_PARSERS: ReadonlyMap<string, DanceScheduleParser> = new Map(
  [roomGridParser].map((parser) => [parser.format, parser]),
)

// Used when a content set's config.yaml doesn't set danceSchedule.format —
// every set authored before parsers became pluggable.
export const DEFAULT_DANCE_SCHEDULE_FORMAT = roomGridParser.format

export function getDanceScheduleParser(
  format: string,
  configFile: string,
  parsers: ReadonlyMap<string, DanceScheduleParser> = DANCE_SCHEDULE_PARSERS,
): DanceScheduleParser {
  const parser = parsers.get(format)
  if (!parser) {
    const valid = [...parsers.values()].map((p) => `"${p.format}" (${p.description})`).join(', ')
    throw new Error(`${configFile}'s "danceSchedule.format" is ${JSON.stringify(format)}, which isn't a known format. Valid: ${valid}`)
  }
  return parser
}

export interface DanceScheduleSource {
  parser: DanceScheduleParser
  sourceFile: string
}

// Which parser reads a content set's dance schedule, and from which file — shared
// by loading (below) and danceSchedulePlugin's dev-server file watching, so the
// two can never disagree about which file matters.
export function resolveDanceScheduleSource(
  contentDir: string,
  parsers: ReadonlyMap<string, DanceScheduleParser> = DANCE_SCHEDULE_PARSERS,
): DanceScheduleSource {
  const configFile = path.join(contentDir, 'config.yaml')
  const format = loadDanceScheduleFormat(configFile) ?? DEFAULT_DANCE_SCHEDULE_FORMAT
  const parser = getDanceScheduleParser(format, configFile, parsers)
  return { parser, sourceFile: path.join(contentDir, 'data', parser.sourceFileName) }
}

// The single entry point every build path uses to get a content set's sessions:
// danceSchedulePlugin (virtual:dance-schedule) and vite-plugin-content-sets.ts
// (each set's date range) — so both always run the exact same pipeline.
// `contentDir` is the content set's root (holds config.yaml and data/).
export async function loadDanceScheduleData(
  contentDir: string,
  parsers: ReadonlyMap<string, DanceScheduleParser> = DANCE_SCHEDULE_PARSERS,
): Promise<DanceSessionData[]> {
  const { parser, sourceFile } = resolveDanceScheduleSource(contentDir, parsers)
  const { sessions, errors: parseErrors } = await parser.parse(sourceFile)

  // Data-model rules, enforced once here for every format. A cell/row that failed
  // to parse never made it into `sessions`, so it can't cause a knock-on conflict.
  const errors = [...parseErrors, ...validateDanceSessions(sessions)]

  if (errors.length > 0) {
    const details = errors.map((error) => `  ${error}`).join('\n\n')
    throw new Error(`Failed to parse ${sourceFile} — ${errors.length} error(s):\n\n${details}`)
  }

  // Source locations are build-time only — never shipped in virtual:dance-schedule.
  return sessions.map(({ session }) => session)
}
