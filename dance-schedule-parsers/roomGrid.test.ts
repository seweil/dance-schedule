import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { roomGridParser } from './roomGrid'

// A smoke test of the wiring only (file read, non-schedule sheets skipped, per-sheet
// results concatenated) — the cell/sheet parsing itself is covered in detail by
// src/lib/parseDanceScheduleSheet.test.ts.
describe('roomGridParser', () => {
  it('parses the automated-testing sample event with no errors', async () => {
    const sourceFile = path.resolve('content/automated-testing/data', roomGridParser.sourceFileName)
    const { sessions, errors } = await roomGridParser.parse(sourceFile)
    expect(errors).toEqual([])
    expect(sessions.length).toBeGreaterThan(0)
    // One sheet per day — the sample event spans several.
    expect(new Set(sessions.map((session) => session.date)).size).toBeGreaterThan(1)
  })
})
