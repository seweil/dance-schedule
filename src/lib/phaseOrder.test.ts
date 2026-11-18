import { describe, expect, it } from 'vitest'
import { PHASE_LABELS, getPresentPhaseIndexRange, isSessionInPhaseRange, usesPhases } from './phaseOrder'
import type { DanceSession, StructuredSession } from '../types/danceSchedule'

function makeSession(overrides: Partial<StructuredSession> = {}): StructuredSession {
  return {
    kind: 'structured',
    date: new Date('2027-01-30T00:00:00.000Z'),
    startTime: new Date('2027-01-30T10:00:00.000Z'),
    endTime: new Date('2027-01-30T11:00:00.000Z'),
    location: { kind: 'located', rooms: ['Room 3/4'] },
    levels: [],
    eventType: 'Dancing',
    callers: [],
    danceForm: 'round',
    ...overrides,
  }
}

const square = makeSession({ levels: ['Plus'], danceForm: undefined, callers: ['Ted Lizotte'] })
const freeform: DanceSession = {
  kind: 'freeform',
  date: new Date('2027-01-30T00:00:00.000Z'),
  startTime: new Date('2027-01-30T12:00:00.000Z'),
  endTime: new Date('2027-01-30T13:00:00.000Z'),
  location: { kind: 'roomless' },
  description: 'Lunch',
}

describe('phaseOrder', () => {
  it('labels phases 1 through 6', () => {
    expect(PHASE_LABELS).toEqual(['Ph 1', 'Ph 2', 'Ph 3', 'Ph 4', 'Ph 5', 'Ph 6'])
  })

  it('reports whether any session has a stated phase', () => {
    expect(usesPhases([square, freeform, makeSession({ phases: [] })])).toBe(false)
    expect(usesPhases([square, makeSession({ phases: [3] })])).toBe(true)
  })

  it('shows a session with any phase in range, and always one with no phase', () => {
    const phase3to5 = makeSession({ phases: [3, 4, 5] })
    // Indices: phase 1 is index 0.
    expect(isSessionInPhaseRange(phase3to5, 4, 5)).toBe(true)
    expect(isSessionInPhaseRange(phase3to5, 0, 1)).toBe(false)
    expect(isSessionInPhaseRange(makeSession({ phases: [] }), 5, 5)).toBe(true)
    expect(isSessionInPhaseRange(square, 5, 5)).toBe(true)
    expect(isSessionInPhaseRange(freeform, 5, 5)).toBe(true)
  })

  it('trims the present range to the phases scheduled, or falls back to the full scale', () => {
    expect(getPresentPhaseIndexRange([makeSession({ phases: [2] }), makeSession({ phases: [3, 4, 5] })])).toEqual({
      minIndex: 1,
      maxIndex: 4,
    })
    expect(getPresentPhaseIndexRange([square, freeform])).toEqual({ minIndex: 0, maxIndex: 5 })
  })
})
