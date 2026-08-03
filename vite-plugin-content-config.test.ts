import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadContentConfigData } from './vite-plugin-content-config'

const OVERRIDE_ENV_VARS = ['COMBINE_A1A2', 'COMBINE_C3BC4', 'DANCE_SCHEDULE_ROOM_ORDER'] as const

let root: string
let configFile: string
let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-config-test-'))
  configFile = path.join(root, 'config.yaml')
  // Isolate every test from whatever's actually in the shell's environment (and
  // from any other test in this file) — these are exactly the vars a developer
  // would export in their own shell for local preview (see docs/testing.md).
  savedEnv = {}
  for (const key of OVERRIDE_ENV_VARS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  for (const key of OVERRIDE_ENV_VARS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = savedEnv[key]
    }
  }
})

function writeConfig(contents: string): void {
  fs.writeFileSync(configFile, contents)
}

describe('loadContentConfigData', () => {
  describe('features.combineA1A2 / features.combineC3BC4 (config.yaml-driven)', () => {
    it('defaults both to true when config.yaml is missing', () => {
      expect(loadContentConfigData(configFile).features).toEqual({ combineA1A2: true, combineC3BC4: true })
    })

    it('defaults both to true when the features section is missing', () => {
      writeConfig('testFixture: true\n')
      expect(loadContentConfigData(configFile).features).toEqual({ combineA1A2: true, combineC3BC4: true })
    })

    it('reads explicit false values', () => {
      writeConfig('features:\n  combineA1A2: false\n  combineC3BC4: false\n')
      expect(loadContentConfigData(configFile).features).toEqual({ combineA1A2: false, combineC3BC4: false })
    })

    it('throws on malformed YAML', () => {
      writeConfig('features: [unterminated\n')
      expect(() => loadContentConfigData(configFile)).toThrow(/Failed to parse/)
    })

    it('throws when combineA1A2 is present but not a boolean', () => {
      writeConfig('features:\n  combineA1A2: yes-please\n')
      expect(() => loadContentConfigData(configFile)).toThrow(/"features\.combineA1A2" must be a boolean/)
    })

    it('throws when combineC3BC4 is present but not a boolean', () => {
      writeConfig('features:\n  combineC3BC4: yes-please\n')
      expect(() => loadContentConfigData(configFile)).toThrow(/"features\.combineC3BC4" must be a boolean/)
    })
  })

  describe('danceSchedule.roomOrder (config.yaml-driven)', () => {
    it('is undefined when config.yaml is missing', () => {
      expect(loadContentConfigData(configFile).danceSchedule).toBeUndefined()
    })

    it('is undefined when the danceSchedule section is missing', () => {
      writeConfig('features:\n  combineA1A2: true\n')
      expect(loadContentConfigData(configFile).danceSchedule).toBeUndefined()
    })

    it('reads "spreadsheet"', () => {
      writeConfig('danceSchedule:\n  roomOrder: spreadsheet\n')
      expect(loadContentConfigData(configFile).danceSchedule).toEqual({ roomOrder: 'spreadsheet' })
    })

    it('reads an explicit array of room names', () => {
      writeConfig('danceSchedule:\n  roomOrder: [Room A, Room B]\n')
      expect(loadContentConfigData(configFile).danceSchedule).toEqual({ roomOrder: ['Room A', 'Room B'] })
    })

    it('throws when roomOrder is neither "spreadsheet" nor an array of strings', () => {
      writeConfig('danceSchedule:\n  roomOrder: 42\n')
      expect(() => loadContentConfigData(configFile)).toThrow(/"danceSchedule\.roomOrder" must be/)
    })

    it('throws when roomOrder is an array containing a non-string', () => {
      writeConfig('danceSchedule:\n  roomOrder: [Room A, 42]\n')
      expect(() => loadContentConfigData(configFile)).toThrow(/"danceSchedule\.roomOrder" must be/)
    })
  })

  // Dev-only preview overrides (see docs/testing.md/docs/design/content-config.md) —
  // applied inside loadContentConfigData itself so both its callers (the
  // client-shipped virtual:content-config module, and vite-plugin-dance-schedule.ts's
  // validateRoomOrderConfig cross-check) automatically see the same effective value.
  describe('COMBINE_A1A2 / COMBINE_C3BC4 env-var overrides', () => {
    it('leaves the config.yaml value unchanged when unset', () => {
      writeConfig('features:\n  combineA1A2: false\n')
      expect(loadContentConfigData(configFile).features.combineA1A2).toBe(false)
    })

    it('overrides a true config.yaml value to false', () => {
      writeConfig('features:\n  combineA1A2: true\n')
      process.env.COMBINE_A1A2 = 'false'
      expect(loadContentConfigData(configFile).features.combineA1A2).toBe(false)
    })

    it('overrides a false config.yaml value to true', () => {
      writeConfig('features:\n  combineA1A2: false\n')
      process.env.COMBINE_A1A2 = 'true'
      expect(loadContentConfigData(configFile).features.combineA1A2).toBe(true)
    })

    it('overrides combineC3BC4 independently of combineA1A2', () => {
      writeConfig('features:\n  combineA1A2: true\n  combineC3BC4: true\n')
      process.env.COMBINE_C3BC4 = 'false'
      expect(loadContentConfigData(configFile).features).toEqual({ combineA1A2: true, combineC3BC4: false })
    })

    it('applies even when config.yaml is entirely missing', () => {
      process.env.COMBINE_A1A2 = 'false'
      expect(loadContentConfigData(configFile).features.combineA1A2).toBe(false)
    })

    it('throws on a malformed override value', () => {
      process.env.COMBINE_A1A2 = 'nope'
      expect(() => loadContentConfigData(configFile)).toThrow(/COMBINE_A1A2 must be "true" or "false"/)
    })

    it('does not suppress a config.yaml validation error even when an override is also set', () => {
      writeConfig('features:\n  combineA1A2: yes-please\n')
      process.env.COMBINE_A1A2 = 'false'
      expect(() => loadContentConfigData(configFile)).toThrow(/"features\.combineA1A2" must be a boolean/)
    })
  })

  describe('DANCE_SCHEDULE_ROOM_ORDER env-var override', () => {
    it('leaves the config.yaml value unchanged when unset', () => {
      writeConfig('danceSchedule:\n  roomOrder: spreadsheet\n')
      expect(loadContentConfigData(configFile).danceSchedule).toEqual({ roomOrder: 'spreadsheet' })
    })

    it('"default" forces undefined even when config.yaml sets "spreadsheet"', () => {
      writeConfig('danceSchedule:\n  roomOrder: spreadsheet\n')
      process.env.DANCE_SCHEDULE_ROOM_ORDER = 'default'
      expect(loadContentConfigData(configFile).danceSchedule).toBeUndefined()
    })

    it('"default" forces undefined even when config.yaml sets an explicit array', () => {
      writeConfig('danceSchedule:\n  roomOrder: [Room A, Room B]\n')
      process.env.DANCE_SCHEDULE_ROOM_ORDER = 'default'
      expect(loadContentConfigData(configFile).danceSchedule).toBeUndefined()
    })

    it('overrides to "spreadsheet"', () => {
      process.env.DANCE_SCHEDULE_ROOM_ORDER = 'spreadsheet'
      expect(loadContentConfigData(configFile).danceSchedule).toEqual({ roomOrder: 'spreadsheet' })
    })

    it('overrides to a comma-separated room list, trimmed', () => {
      process.env.DANCE_SCHEDULE_ROOM_ORDER = 'Room A, Room B ,Room C'
      expect(loadContentConfigData(configFile).danceSchedule).toEqual({
        roomOrder: ['Room A', 'Room B', 'Room C'],
      })
    })

    it('applies even when config.yaml is entirely missing', () => {
      process.env.DANCE_SCHEDULE_ROOM_ORDER = 'spreadsheet'
      expect(loadContentConfigData(configFile).danceSchedule).toEqual({ roomOrder: 'spreadsheet' })
    })

    it('throws on an empty/whitespace-only value', () => {
      process.env.DANCE_SCHEDULE_ROOM_ORDER = '   '
      expect(() => loadContentConfigData(configFile)).toThrow(/DANCE_SCHEDULE_ROOM_ORDER must be/)
    })

    it('throws on a value that is only commas', () => {
      process.env.DANCE_SCHEDULE_ROOM_ORDER = ',,,'
      expect(() => loadContentConfigData(configFile)).toThrow(/DANCE_SCHEDULE_ROOM_ORDER must be/)
    })
  })
})
