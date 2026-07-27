import { describe, expect, it } from 'vitest'
import {
  formatSessionCallerDetails,
  formatSessionCallers,
  formatSessionEventTypePrefix,
  formatSessionGca,
  formatSessionLevels,
  formatSessionRoom,
  formatSessionTimeRange,
} from './formatDanceSession'
import type { DanceSession, StructuredSession } from '../types/danceSchedule'

function makeStructured(overrides: Partial<StructuredSession> = {}): StructuredSession {
  return {
    kind: 'structured',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date('2026-07-02T12:30:00.000Z'),
    endTime: new Date('2026-07-02T13:30:00.000Z'),
    location: { kind: 'located', rooms: ['Ballroom Centre'] },
    levels: ['SSD'],
    eventType: 'Dancing',
    callers: ['Ted Lizotte'],
    ...overrides,
  }
}

const FREEFORM: DanceSession = {
  kind: 'freeform',
  date: new Date('2026-07-04T00:00:00.000Z'),
  startTime: new Date('2026-07-04T21:00:00.000Z'),
  endTime: new Date('2026-07-04T21:30:00.000Z'),
  location: { kind: 'located', rooms: ['Drummond Ballroom'] },
  description: 'Country Western Dance - until 1am',
}

describe('formatSessionTimeRange', () => {
  it('formats start/end pinned to UTC', () => {
    expect(formatSessionTimeRange(makeStructured())).toBe('12:30 PM – 1:30 PM')
  })
})

describe('formatSessionLevels', () => {
  it('joins multiple levels with ", "', () => {
    expect(formatSessionLevels(makeStructured({ levels: ['C1', 'C2'] }))).toBe('C1, C2')
  })

  it('is empty for a freeform session', () => {
    expect(formatSessionLevels(FREEFORM)).toBe('')
  })
})

describe('formatSessionCallerDetails', () => {
  it('formats "eventType - callers" for a structured session', () => {
    expect(
      formatSessionCallerDetails(
        makeStructured({ eventType: 'Leather Tip', callers: ['Michael Kellogg', 'Terri Sherrer'] }),
      ),
    ).toBe('Leather Tip - Michael Kellogg & Terri Sherrer')
  })

  it('returns the bare description for a freeform session, with no "(freeform)" marker', () => {
    expect(formatSessionCallerDetails(FREEFORM)).toBe('Country Western Dance - until 1am')
  })
})

describe('formatSessionEventTypePrefix', () => {
  it('is empty for the common "Dancing" event type', () => {
    expect(formatSessionEventTypePrefix(makeStructured({ eventType: 'Dancing' }))).toBe('')
  })

  it('includes a trailing " - " for any other event type', () => {
    expect(formatSessionEventTypePrefix(makeStructured({ eventType: 'Skirt Work Hour' }))).toBe(
      'Skirt Work Hour - ',
    )
  })

  it('is empty for a freeform session', () => {
    expect(formatSessionEventTypePrefix(FREEFORM)).toBe('')
  })
})

describe('formatSessionCallers', () => {
  it('joins multiple callers with " & "', () => {
    expect(
      formatSessionCallers(makeStructured({ callers: ['Michael Kellogg', 'Terri Sherrer'] })),
    ).toBe('Michael Kellogg & Terri Sherrer')
  })

  it('is empty for a freeform session', () => {
    expect(formatSessionCallers(FREEFORM)).toBe('')
  })
})

describe('formatSessionGca', () => {
  it('returns the GCA name when present', () => {
    expect(formatSessionGca(makeStructured({ gca: 'Tim Stephens' }))).toBe('Tim Stephens')
  })

  it('is empty when absent', () => {
    expect(formatSessionGca(makeStructured({ gca: undefined }))).toBe('')
  })

  it('is empty for a freeform session', () => {
    expect(formatSessionGca(FREEFORM)).toBe('')
  })
})

describe('formatSessionRoom', () => {
  it('returns a single room name unchanged', () => {
    expect(formatSessionRoom(makeStructured({ location: { kind: 'located', rooms: ['Hemon'] } }))).toBe('Hemon')
  })

  it('joins multiple rooms with ", "', () => {
    expect(
      formatSessionRoom(
        makeStructured({ location: { kind: 'located', rooms: ['Ballroom Centre', 'Ballroom East'] } }),
      ),
    ).toBe('Ballroom Centre, Ballroom East')
  })

  it('renders an em dash for a roomless session', () => {
    expect(formatSessionRoom(makeStructured({ location: { kind: 'roomless' } }))).toBe('—')
  })
})
