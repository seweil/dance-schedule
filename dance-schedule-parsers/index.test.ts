import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DANCE_SCHEDULE_PARSERS,
  DEFAULT_DANCE_SCHEDULE_FORMAT,
  getDanceScheduleParser,
  loadDanceScheduleData,
  resolveDanceScheduleSource,
  type DanceScheduleParser,
  type DanceScheduleParseResult,
} from '.'
import type { DanceSessionData } from '../src/types/danceSchedule'

const SESSION: DanceSessionData = {
  kind: 'freeform',
  date: '2026-07-04T00:00:00.000Z',
  startTime: '2026-07-04T12:00:00.000Z',
  endTime: '2026-07-04T13:00:00.000Z',
  location: { kind: 'roomless' },
  description: 'Lunch',
}

function stubParser(format: string, result: DanceScheduleParseResult): DanceScheduleParser & { calls: string[] } {
  const calls: string[] = []
  return {
    format,
    sourceFileName: `${format}.src`,
    description: `stub ${format}`,
    calls,
    async parse(sourceFile) {
      calls.push(sourceFile)
      return result
    },
  }
}

let contentDir: string

beforeEach(() => {
  contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dance-schedule-parsers-test-'))
})

afterEach(() => {
  fs.rmSync(contentDir, { recursive: true, force: true })
})

function writeConfig(contents: string): void {
  fs.writeFileSync(path.join(contentDir, 'config.yaml'), contents)
}

describe('the parser registry', () => {
  it('registers room-grid as the default format', () => {
    expect(DEFAULT_DANCE_SCHEDULE_FORMAT).toBe('room-grid')
    expect(DANCE_SCHEDULE_PARSERS.get('room-grid')?.sourceFileName).toBe('dance-schedule.xlsx')
  })

  it('throws for an unknown format, naming it and listing the valid ones', () => {
    expect(() => getDanceScheduleParser('nope', 'content/x/config.yaml')).toThrow(
      /content\/x\/config\.yaml's "danceSchedule\.format" is "nope", which isn't a known format\. Valid: "room-grid" \(/,
    )
  })
})

describe('resolveDanceScheduleSource', () => {
  it('uses the default format, and its file under data/, when config.yaml is missing', () => {
    const { parser, sourceFile } = resolveDanceScheduleSource(contentDir)
    expect(parser.format).toBe('room-grid')
    expect(sourceFile).toBe(path.join(contentDir, 'data', 'dance-schedule.xlsx'))
  })

  it("uses the format config.yaml selects, and that parser's own file name", () => {
    writeConfig('danceSchedule:\n  format: other\n')
    const parsers = new Map([['other', stubParser('other', { sessions: [], errors: [] })]])
    const { parser, sourceFile } = resolveDanceScheduleSource(contentDir, parsers)
    expect(parser.format).toBe('other')
    expect(sourceFile).toBe(path.join(contentDir, 'data', 'other.src'))
  })
})

describe('loadDanceScheduleData', () => {
  it("returns the selected parser's sessions, having passed it the resolved source file", async () => {
    writeConfig('danceSchedule:\n  format: other\n')
    const parser = stubParser('other', { sessions: [SESSION], errors: [] })
    const sessions = await loadDanceScheduleData(contentDir, new Map([['other', parser]]))
    expect(sessions).toEqual([SESSION])
    expect(parser.calls).toEqual([path.join(contentDir, 'data', 'other.src')])
  })

  it("aggregates every one of a parser's errors into a single thrown message", async () => {
    writeConfig('danceSchedule:\n  format: other\n')
    const parser = stubParser('other', { sessions: [SESSION], errors: ['first problem', 'second problem'] })
    const sourceFile = path.join(contentDir, 'data', 'other.src')
    await expect(loadDanceScheduleData(contentDir, new Map([['other', parser]]))).rejects.toThrow(
      `Failed to parse ${sourceFile} — 2 error(s):\n\n  first problem\n\n  second problem`,
    )
  })
})
