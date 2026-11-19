import { describe, expect, it } from 'vitest'
import {
  formatSessionCallerDetails,
  formatSessionCallers,
  formatSessionCuers,
  formatSessionEventTypePrefix,
  formatSessionGca,
  formatSessionLevels,
  formatSessionRoom,
  formatSessionRoomLabel,
  formatSessionTimeRange,
} from './formatDanceSession'
import { formatLevel } from './levelCodes'
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

  it('shows MSX by its display label, not its code', () => {
    expect(formatSessionLevels(makeStructured({ levels: ['MS', 'MSX'] }))).toBe(`MS, ${formatLevel('MSX')}`)
    expect(formatLevel('MSX')).not.toBe('MSX')
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

  it('falls back to the cuers for a session with no caller (round dancing)', () => {
    expect(formatSessionCallers(makeStructured({ callers: [], cuers: ['Pam & Jeff Johnson'] }))).toBe('Pam & Jeff Johnson')
  })
})

describe('formatSessionCuers', () => {
  it("lists a square session's cuers for its secondary line", () => {
    expect(formatSessionCuers(makeStructured({ cuers: ['Judy Russell'] }))).toBe('Judy Russell')
  })

  it('is empty when the cuers are already the primary names, or there are none', () => {
    expect(formatSessionCuers(makeStructured({ callers: [], cuers: ['Pam & Jeff Johnson'] }))).toBe('')
    expect(formatSessionCuers(makeStructured())).toBe('')
    expect(formatSessionCuers(FREEFORM)).toBe('')
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

  it('keeps the full name — only the card label abbreviates', () => {
    expect(formatSessionRoom(makeStructured({ location: { kind: 'located', rooms: ['Conference Room 1'] } }))).toBe(
      'Conference Room 1',
    )
  })
})

describe('formatSessionRoomLabel', () => {
  it('abbreviates each room, joined with ", "', () => {
    const rooms = ['Conference Room 1', 'Willamette South (Hall A)']
    expect(formatSessionRoomLabel(makeStructured({ location: { kind: 'located', rooms } }))).toBe(
      'Conf Room 1, Willamette South (Hall A)',
    )
  })

  it('renders an em dash for a roomless session', () => {
    expect(formatSessionRoomLabel(makeStructured({ location: { kind: 'roomless' } }))).toBe('—')
  })
})

describe('formatSessionLevels / formatSessionCallerDetails', () => {
  describe('round dancing and clogging', () => {
    it.each([
      [[3, 4, 5], 'Rounds Ph 3-5'],
      [[3], 'Rounds Ph 3'],
      [[2, 4], 'Rounds Ph 2, 4'],
      [[], 'Rounds'],
    ])('formats round-dance phases %j as %j', (phases, expected) => {
      expect(formatSessionLevels(makeStructured({ levels: [], danceForm: 'round', phases }))).toBe(expected)
    })

    it('formats a clogging session as Clogging', () => {
      expect(formatSessionLevels(makeStructured({ levels: [], danceForm: 'clogging' }))).toBe('Clogging')
    })

    it('appends the cuer to a square dance\'s caller details', () => {
      expect(formatSessionCallerDetails(makeStructured({ cuers: ['Pam & Jeff Johnson'] }))).toBe(
        'Dancing - Ted Lizotte (cuer: Pam & Jeff Johnson)',
      )
    })

    it('drops the empty caller part for a session with only a cuer', () => {
      expect(
        formatSessionCallerDetails(makeStructured({ eventType: 'Teach', callers: [], cuers: ['Pam & Jeff Johnson'] })),
      ).toBe('Teach (cuer: Pam & Jeff Johnson)')
    })
  })
})
