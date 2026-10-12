import { describe, expect, it } from 'vitest'
import { parseDanceScheduleSheet } from './parseDanceScheduleSheet'
import { validateDanceSessions, type SourcedDanceSession } from './validateDanceSessions'
import type { DanceSessionData, LevelCode, SessionLocation } from '../types/danceSchedule'

function located(...rooms: string[]): SessionLocation {
  return { kind: 'located', rooms }
}

// A structured session on July 2, 2026 between two "HH:MM" wall-clock times.
function dance(
  source: string,
  start: string,
  end: string,
  overrides: { callers?: string[]; location?: SessionLocation; gca?: string; levels?: string[]; day?: string } = {},
): SourcedDanceSession {
  const day = overrides.day ?? '2026-07-02'
  const session: DanceSessionData = {
    kind: 'structured',
    date: `${day}T00:00:00.000Z`,
    startTime: `${day}T${start}:00.000Z`,
    endTime: `${day}T${end}:00.000Z`,
    location: overrides.location ?? located('Ballroom Centre'),
    levels: (overrides.levels ?? ['SSD']) as LevelCode[],
    eventType: 'Dancing',
    callers: overrides.callers ?? ['Vic Ceder'],
    gca: overrides.gca,
  }
  return { session, source }
}

describe('validateDanceSessions', () => {
  it('accepts an empty schedule', () => {
    expect(validateDanceSessions([])).toEqual([])
  })

  describe('caller double-booking', () => {
    it('flags the same caller in two rooms at the identical time, on the later session', () => {
      const errors = validateDanceSessions([
        dance('A', '12:30', '13:30', { location: located('Ballroom Centre') }),
        dance('B', '12:30', '13:30', { location: located('Ballroom East') }),
      ])
      expect(errors).toEqual(['B: caller "Vic Ceder" is already booked by A'])
    })

    it('flags overlapping, non-identical times', () => {
      const errors = validateDanceSessions([
        dance('A', '12:30', '13:30', { location: located('Ballroom Centre') }),
        dance('B', '13:00', '14:00', { location: located('Ballroom East') }),
      ])
      expect(errors).toEqual(['B: caller "Vic Ceder" is already booked by A'])
    })

    it('allows back-to-back sessions (half-open intervals)', () => {
      const errors = validateDanceSessions([
        dance('A', '12:30', '13:30', { location: located('Ballroom Centre') }),
        dance('B', '13:30', '14:30', { location: located('Ballroom East') }),
      ])
      expect(errors).toEqual([])
    })

    it('allows different callers at the same time', () => {
      const errors = validateDanceSessions([
        dance('A', '12:30', '13:30', { location: located('Ballroom Centre') }),
        dance('B', '12:30', '13:30', { location: located('Ballroom East'), callers: ['Ted Lizotte'] }),
      ])
      expect(errors).toEqual([])
    })

    it('does not flag a session naming the same co-caller twice against itself', () => {
      expect(validateDanceSessions([dance('A', '12:30', '13:30', { callers: ['Vic Ceder', 'Vic Ceder'] })])).toEqual([])
    })

    it('ignores GCA credits, checking headline callers only', () => {
      const errors = validateDanceSessions([
        dance('A', '12:30', '13:30', { location: located('Ballroom Centre'), callers: ['Kris Jensen'], gca: 'Tim Stephens' }),
        dance('B', '12:30', '13:30', { location: located('Ballroom East'), callers: ['Ted Lizotte'], gca: 'Tim Stephens' }),
      ])
      expect(errors).toEqual([])
    })

    it('never conflicts across different days at the same clock time', () => {
      const errors = validateDanceSessions([
        dance('A', '12:30', '13:30', { location: located('Ballroom Centre') }),
        dance('B', '12:30', '13:30', { location: located('Ballroom Centre'), day: '2026-07-03' }),
      ])
      expect(errors).toEqual([])
    })

    it('catches a past-midnight session overlapping the next day (absolute times, not per day)', () => {
      const lateNight: SourcedDanceSession = {
        source: 'A',
        session: {
          ...dance('A', '23:00', '23:59').session,
          endTime: '2026-07-03T01:00:00.000Z',
        },
      }
      const errors = validateDanceSessions([
        lateNight,
        dance('B', '00:30', '01:30', { location: located('Ballroom East'), day: '2026-07-03' }),
      ])
      expect(errors).toEqual(['B: caller "Vic Ceder" is already booked by A'])
    })
  })

  describe('room double-booking', () => {
    it('flags the same room booked twice at overlapping times', () => {
      const errors = validateDanceSessions([
        dance('A', '12:30', '13:30'),
        dance('B', '13:00', '14:00', { callers: ['Ted Lizotte'] }),
      ])
      expect(errors).toEqual(['B: room "Ballroom Centre" is already booked by A'])
    })

    it('checks every room of a multi-room session', () => {
      const errors = validateDanceSessions([
        dance('A', '12:30', '13:30', { location: located('Ballroom Centre', 'Ballroom East') }),
        dance('B', '13:00', '14:00', { location: located('Ballroom East'), callers: ['Ted Lizotte'] }),
      ])
      expect(errors).toEqual(['B: room "Ballroom East" is already booked by A'])
    })

    it('does not flag a session listing the same room twice against itself', () => {
      expect(
        validateDanceSessions([dance('A', '12:30', '13:30', { location: located('Ballroom Centre', 'Ballroom Centre') })]),
      ).toEqual([])
    })

    it('ignores roomless sessions', () => {
      const errors = validateDanceSessions([
        dance('A', '12:30', '13:30', { location: { kind: 'roomless' } }),
        dance('B', '12:30', '13:30', { location: { kind: 'roomless' }, callers: ['Ted Lizotte'] }),
      ])
      expect(errors).toEqual([])
    })
  })

  it('reports both a caller and a room conflict when both apply', () => {
    const errors = validateDanceSessions([dance('A', '12:30', '13:30'), dance('B', '12:30', '13:30')])
    expect(errors).toEqual([
      'B: caller "Vic Ceder" is already booked by A',
      'B: room "Ballroom Centre" is already booked by A',
    ])
  })

  it('flags an unrecognized level code (a safety net for a parser that casts)', () => {
    expect(validateDanceSessions([dance('A', '12:30', '13:30', { levels: ['SSD', 'C5'] })])).toEqual([
      'A: unrecognized level code "C5"',
    ])
  })

  // The same scenarios the room-grid parser used to check itself, now fed through
  // the real parser's output — pins down the end-to-end messages an organizer sees.
  describe("with the room-grid parser's output", () => {
    const REFERENCE_DATE = new Date(Date.UTC(2026, 6, 1))

    function validateRows(rows: unknown[][]): string[] {
      const { sessions, sources, errors } = parseDanceScheduleSheet('Thursday July 2', rows, REFERENCE_DATE)
      expect(errors).toEqual([])
      return validateDanceSessions(sessions.map((session, index) => ({ session, source: sources[index]! })))
    }

    it('names both cells for a caller booked in two rooms at once', () => {
      expect(
        validateRows([
          ['Time', 'Ballroom Centre', 'Ballroom East'],
          ['12:30p-1:30p', 'SSD : Dancing - Vic Ceder', 'Plus : Dancing - Vic Ceder'],
        ]),
      ).toEqual([
        'Sheet "Thursday July 2", cell C2 (time "12:30p-1:30p", room "Ballroom East"): caller "Vic Ceder" is already booked by Sheet "Thursday July 2", cell B2 (time "12:30p-1:30p", room "Ballroom Centre")',
      ])
    })

    it('flags a ditto-spanned room that a later row uses directly', () => {
      expect(
        validateRows([
          ['Time', 'Ballroom Centre', 'Ballroom East'],
          ['12:30p-1:30p', 'SSD : Combined Dance - Vic Ceder', '"'],
          ['1:00p-2:00p', null, 'Plus : Dancing - Ted Lizotte'],
        ]),
      ).toEqual([
        'Sheet "Thursday July 2", cell C3 (time "1:00p-2:00p", room "Ballroom East"): room "Ballroom East" is already booked by Sheet "Thursday July 2", cell B2 (time "12:30p-1:30p", room "Ballroom Centre")',
      ])
    })

    it('reports a "ROOMS:" line claiming a room whose cell has content as a room conflict on that cell', () => {
      expect(
        validateRows([
          ['Time', 'Ballroom Centre', 'Ballroom West'],
          [
            '12:30p-1:30p',
            'SSD : Combined Dance - Vic Ceder\nROOMS: Ballroom Centre, Ballroom West',
            'Plus : Dancing - Ted Lizotte',
          ],
        ]),
      ).toEqual([
        'Sheet "Thursday July 2", cell C2 (time "12:30p-1:30p", room "Ballroom West"): room "Ballroom West" is already booked by Sheet "Thursday July 2", cell B2 (time "12:30p-1:30p", room "Ballroom Centre")',
      ])
    })
  })
})
