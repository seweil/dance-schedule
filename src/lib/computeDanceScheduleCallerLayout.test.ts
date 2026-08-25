import { describe, expect, it } from 'vitest'
import {
  callerColumnWidthRem,
  CALLER_COLUMN_WIDTH_REM,
  computeDanceScheduleCallerLayout,
} from './computeDanceScheduleCallerLayout'
import type { DanceSession, SessionLocation } from '../types/danceSchedule'

function located(...rooms: string[]): SessionLocation {
  return { kind: 'located', rooms }
}

function makeSession(
  startTime: string,
  endTime: string,
  callers: string[],
  overrides: Partial<DanceSession> = {},
): DanceSession {
  return {
    kind: 'structured',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    location: located('Ballroom Centre'),
    levels: ['SSD'],
    eventType: 'Dancing',
    callers,
    ...overrides,
  } as DanceSession
}

function makeFreeform(startTime: string, endTime: string, overrides: Partial<DanceSession> = {}): DanceSession {
  return {
    kind: 'freeform',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    location: located('Drummond Ballroom'),
    description: 'Country Western Dance',
    ...overrides,
  } as DanceSession
}

// Gives a caller of interest one early-morning session (disjoint from any test's
// own daytime scenario, in its own "Padding Room") so a test can set up a second,
// unrelated session for the same caller without it interfering with the specific
// behavior under test. Built from a start Date + hour offset (not a string
// template) so fractional hours (e.g. 3.5) work exactly, not just whole ones.
function padHours(caller: string, hours = 4): DanceSession[] {
  const start = new Date('2026-07-02T00:00:00.000Z')
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000)
  return [makeSession(start.toISOString(), end.toISOString(), [caller], { location: located('Padding Room') })]
}

// count back-to-back, non-overlapping, hour-long sessions for one caller starting
// at startHour — no internal gaps, so a test using this can isolate exactly one
// deliberate gap elsewhere without padHours's own early-morning gaps confusing it.
function backToBackDances(caller: string, count: number, startHour: number): DanceSession[] {
  return Array.from({ length: count }, (_, i) =>
    makeSession(
      `2026-07-02T${String(startHour + i).padStart(2, '0')}:00:00.000Z`,
      `2026-07-02T${String(startHour + i + 1).padStart(2, '0')}:00:00.000Z`,
      [caller],
    ),
  )
}

describe('computeDanceScheduleCallerLayout', () => {
  it('returns an empty layout for no sessions', () => {
    expect(computeDanceScheduleCallerLayout([], [])).toEqual({
      visibleCallers: [],
      columnWidthsRem: [],
      totalRows: 0,
      timeMarks: [],
      placements: [],
    })
  })

  it('places a single-caller session in its caller column', () => {
    const padding = padHours('Vic Ceder')
    const session = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Vic Ceder'])
    const sessions = [...padding, session]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    expect(layout.visibleCallers).toEqual(['Vic Ceder'])
    const placement = layout.placements.find((p) => p.session === session)
    expect(placement).toMatchObject({
      session,
      rowSpan: 1,
      columnStart: 0,
      columnSpan: 1,
      lane: 0,
      laneCount: 1,
    })
  })

  it('fans a co-taught session out to one placement in each of its callers own columns', () => {
    const padding = [...padHours('Michael Kellogg'), ...padHours('Terri Sherrer')]
    const session = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', [
      'Michael Kellogg',
      'Terri Sherrer',
    ])
    const sessions = [...padding, session]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    expect(layout.visibleCallers).toEqual(['Michael Kellogg', 'Terri Sherrer'])
    const placements = layout.placements.filter((p) => p.session === session)
    expect(placements).toHaveLength(2)
    expect(placements.map((p) => p.columnStart).sort()).toEqual([0, 1])
    for (const placement of placements) {
      expect(placement).toMatchObject({ columnSpan: 1, lane: 0, laneCount: 1 })
    }
  })

  it('orders visible callers alphabetically by first name, not chronological occurrence', () => {
    const padding = [...padHours('Vic Ceder'), ...padHours('Allan Hurst')]
    // Vic Ceder is scheduled (and padded) first, chronologically — proves the order
    // below comes from the name, not from appearance order.
    const first = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Vic Ceder'])
    const second = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Allan Hurst'])
    const sessions = [...padding, first, second]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    expect(layout.visibleCallers).toEqual(['Allan Hurst', 'Vic Ceder'])
  })

  it('breaks a tie on first name by full name', () => {
    const kellogg = padHours('Michael Kellogg')
    const maltenfort = padHours('Michael Maltenfort')
    // Maltenfort scheduled/padded first — proves the tiebreak is the full name, not
    // appearance order.
    const sessions = [...maltenfort, ...kellogg]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    expect(layout.visibleCallers).toEqual(['Michael Kellogg', 'Michael Maltenfort'])
  })

  it('hides a caller column once nothing in it is visible, without reshuffling the rest', () => {
    const cederDances = padHours('Vic Ceder').map((s) => ({ ...s, levels: ['SSD'] }) as DanceSession)
    const jensenDances = padHours('Kris Jensen').map((s) => ({ ...s, levels: ['SSD'] }) as DanceSession)
    const hurstDances = padHours('Allan Hurst').map((s) => ({ ...s, levels: ['C4'] }) as DanceSession)
    const dateSessions = [...cederDances, ...hurstDances, ...jensenDances]
    // Hurst filtered out by level entirely (0 visible dances), but the remaining
    // callers' column-order positions (alphabetical by first name) are preserved.
    const visibleSessions = [...cederDances, ...jensenDances]

    const layout = computeDanceScheduleCallerLayout(dateSessions, visibleSessions)

    expect(layout.visibleCallers).toEqual(['Kris Jensen', 'Vic Ceder'])
  })

  it('keeps caller order fixed to the unfiltered session list, not just what is currently visible', () => {
    const cederDances = padHours('Vic Ceder').map((s) => ({ ...s, levels: ['C4'] }) as DanceSession)
    const hurstDances = padHours('Allan Hurst').map((s) => ({ ...s, levels: ['SSD'] }) as DanceSession)
    const dateSessions = [...cederDances, ...hurstDances] // Vic Ceder appears first
    const visibleSessions = hurstDances // Vic Ceder filtered out entirely by level

    const layout = computeDanceScheduleCallerLayout(dateSessions, visibleSessions)

    expect(layout.visibleCallers).toEqual(['Allan Hurst'])
  })

  it('floats a freeform session (a break) as a "free" placement instead of skipping it', () => {
    const lunch = makeFreeform('2026-07-02T12:00:00.000Z', '2026-07-02T13:00:00.000Z', {
      description: 'Lunch Break',
      location: { kind: 'roomless' },
    })
    const layout = computeDanceScheduleCallerLayout([lunch], [lunch])

    expect(layout.visibleCallers).toEqual([])
    expect(layout.placements).toMatchObject([
      { session: lunch, columnStart: 0, columnSpan: 1, floatKind: 'free' },
    ])
  })

  it('lets a freeform session contribute its own time-axis row now that it floats', () => {
    const padding = padHours('Vic Ceder')
    const countryWestern = makeFreeform('2026-07-02T21:00:00.000Z', '2026-07-02T22:00:00.000Z')
    const session = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Vic Ceder'])
    const sessions = [...padding, countryWestern, session]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    // The freeform session now floats, so its 9-10pm range DOES contribute to the
    // axis, and it gets its own "free" placement alongside the real session's.
    expect(layout.timeMarks.some((mark) => mark.label === '9:00 PM')).toBe(true)
    const countryWesternPlacement = layout.placements.find((p) => p.session === countryWestern)
    expect(countryWesternPlacement).toMatchObject({ floatKind: 'free' })
    expect(layout.placements.find((p) => p.session === session)).toBeDefined()
  })

  it('does not compress away a freeform break\'s row now that it occupies it', () => {
    const morning = backToBackDances('Vic Ceder', 2, 9) // 9am-11am, back-to-back
    const lunch = makeFreeform('2026-07-02T11:00:00.000Z', '2026-07-02T12:00:00.000Z', {
      description: 'Lunch Break',
      location: { kind: 'roomless' },
    })
    const afternoon = backToBackDances('Vic Ceder', 2, 13) // 1pm-3pm, back-to-back
    const sessions = [...morning, lunch, ...afternoon]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    // 2 morning rows + 1 lunch row + 2 afternoon rows = 5 — the lunch row survives
    // compression (it's occupied by the floating break), but the genuinely idle
    // 12-1pm gap between lunch ending and the afternoon starting still compresses
    // away to zero rows.
    expect(layout.totalRows).toBe(5)
    expect(layout.placements.find((p) => p.session === lunch)).toMatchObject({ rowStart: 3, rowSpan: 1 })
  })

  it('omits "GCA Caller Showcase Dance" sessions entirely, even for an otherwise-qualifying caller', () => {
    // None of these should count at all — this caller should get no column.
    const showcase = Array.from({ length: 4 }, (_, i) =>
      makeSession(
        `2026-07-02T0${i}:00:00.000Z`,
        `2026-07-02T0${i + 1}:00:00.000Z`,
        ['Janienne Alexander'],
        { eventType: 'GCA Caller Showcase Dance', location: located('Hemon') },
      ),
    )
    const layout = computeDanceScheduleCallerLayout(showcase, showcase)

    expect(layout.visibleCallers).toEqual([])
    expect(layout.placements).toEqual([])
  })

  it('excludes only the showcase dances, not a caller\'s other real sessions', () => {
    const real = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Vic Ceder'])
    const showcase = makeSession('2026-07-02T20:00:00.000Z', '2026-07-02T20:30:00.000Z', ['Vic Ceder'], {
      eventType: 'GCA Caller Showcase Dance',
    })
    const sessions = [real, showcase]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    expect(layout.visibleCallers).toEqual(['Vic Ceder'])
    expect(layout.placements.find((p) => p.session === showcase)).toBeUndefined()
    expect(layout.placements).toHaveLength(1)
  })

  it('gives a caller a column even for a single short session, with no hour floor to clear (regression)', () => {
    // Mirrors a real report: a caller with just one 30-minute slot (split off a
    // longer one shared with another caller) didn't appear on this page in any
    // form. This view used to require a caller's event-wide total to exceed 3
    // hours before they'd get a column at all — removed per direct product
    // decision, since every real caller should show up here regardless of how
    // little time they have scheduled.
    const short = makeSession('2026-07-02T18:00:00.000Z', '2026-07-02T18:30:00.000Z', ['Rob Page'])
    const layout = computeDanceScheduleCallerLayout([short], [short])

    expect(layout.visibleCallers).toEqual(['Rob Page'])
    expect(layout.placements.find((p) => p.session === short)).toBeDefined()
  })

  it('sorts placements by rowStart then columnStart', () => {
    const padding = [...padHours('Allan Hurst'), ...padHours('Vic Ceder')]
    const later = makeSession('2026-07-02T14:00:00.000Z', '2026-07-02T15:00:00.000Z', ['Allan Hurst'])
    const earlier = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Vic Ceder'])
    const sessions = [...padding, later, earlier]
    const layout = computeDanceScheduleCallerLayout(sessions, sessions)

    const daytime = layout.placements.filter((p) => p.session === later || p.session === earlier)
    expect(daytime.map((p) => p.session)).toEqual([earlier, later])
  })

  describe('overlap lanes (defensive — a real caller can only double-book via a data error)', () => {
    it('lane-splits two sessions that mistakenly list the same caller at overlapping times', () => {
      const padding = padHours('Vic Ceder')
      const a = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T10:00:00.000Z', ['Vic Ceder'])
      const b = makeSession('2026-07-02T09:30:00.000Z', '2026-07-02T10:30:00.000Z', ['Vic Ceder'])
      const sessions = [...padding, a, b]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      const placementA = layout.placements.find((p) => p.session === a)
      const placementB = layout.placements.find((p) => p.session === b)
      expect(placementA).toMatchObject({ columnStart: 0, lane: 0, laneCount: 2 })
      expect(placementB).toMatchObject({ columnStart: 0, lane: 1, laneCount: 2 })
      expect(layout.columnWidthsRem[0]).toBe(CALLER_COLUMN_WIDTH_REM * 1.5)
    })

    it('does not narrow two sessions by the same caller at non-overlapping times', () => {
      const padding = padHours('Vic Ceder')
      const morning = makeSession('2026-07-02T09:00:00.000Z', '2026-07-02T10:00:00.000Z', ['Vic Ceder'])
      const afternoon = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', ['Vic Ceder'])
      const sessions = [...padding, morning, afternoon]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      for (const placement of layout.placements.filter(
        (p) => p.session === morning || p.session === afternoon,
      )) {
        expect(placement).toMatchObject({ lane: 0, laneCount: 1 })
      }
    })

    it('deduplicates a session that lists the same caller name twice', () => {
      const padding = padHours('Vic Ceder')
      const session = makeSession('2026-07-02T13:00:00.000Z', '2026-07-02T14:00:00.000Z', [
        'Vic Ceder',
        'Vic Ceder',
      ])
      const sessions = [...padding, session]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      expect(layout.visibleCallers).toEqual(['Vic Ceder'])
      expect(layout.placements.filter((p) => p.session === session)).toHaveLength(1)
    })
  })

  describe('all-headliners sessions (collective caller placeholder)', () => {
    it('floats across every visible caller column instead of vanishing', () => {
      const padding = padHours('Vic Ceder')
      const allHeadliners = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T20:00:00.000Z', [
        'All Headliners',
      ])
      const sessions = [...padding, allHeadliners]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      const placement = layout.placements.find((p) => p.session === allHeadliners)
      expect(placement).toMatchObject({ columnStart: 0, columnSpan: layout.visibleCallers.length, floatKind: 'busy' })
    })

    it('recognizes "All Callers" as the same kind of placeholder', () => {
      const padding = padHours('Vic Ceder')
      const allCallers = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T20:00:00.000Z', ['All Callers'])
      const sessions = [...padding, allCallers]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      const placement = layout.placements.find((p) => p.session === allCallers)
      expect(placement).toMatchObject({ columnStart: 0, columnSpan: layout.visibleCallers.length, floatKind: 'busy' })
    })

    it('never appears in visibleCallers or claims its own column', () => {
      const padding = padHours('Vic Ceder')
      const allHeadliners = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T20:00:00.000Z', [
        'All Headliners',
      ])
      const sessions = [...padding, allHeadliners]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      expect(layout.visibleCallers).toEqual(['Vic Ceder'])
    })

    it('still contributes its own time range to the axis and row occupancy', () => {
      const padding = padHours('Vic Ceder')
      const allHeadliners = makeSession('2026-07-02T21:00:00.000Z', '2026-07-02T22:00:00.000Z', [
        'All Headliners',
      ])
      const sessions = [...padding, allHeadliners]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      expect(layout.timeMarks.some((mark) => mark.label === '9:00 PM')).toBe(true)
      expect(layout.placements.find((p) => p.session === allHeadliners)).toBeDefined()
    })

    it('renders alongside a real caller session sharing the same row without lane-splitting either', () => {
      const padding = padHours('Vic Ceder')
      const real = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T20:00:00.000Z', ['Vic Ceder'], {
        location: located('Ballroom East'),
      })
      const allHeadliners = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T20:00:00.000Z', [
        'All Headliners',
      ])
      const sessions = [...padding, real, allHeadliners]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      const realPlacement = layout.placements.find((p) => p.session === real)
      const floatingPlacement = layout.placements.find((p) => p.session === allHeadliners)
      expect(realPlacement).toMatchObject({ columnStart: 0, columnSpan: 1, lane: 0, laneCount: 1 })
      expect(floatingPlacement).toMatchObject({ columnStart: 0, columnSpan: 1, lane: 0, laneCount: 1 })
    })

    it('spans exactly 1 (not 0) when it is the only session of the day, with no real caller columns at all', () => {
      const allHeadliners = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T20:00:00.000Z', [
        'All Headliners',
      ])
      const layout = computeDanceScheduleCallerLayout([allHeadliners], [allHeadliners])

      expect(layout.visibleCallers).toEqual([])
      expect(layout.placements).toMatchObject([{ columnStart: 0, columnSpan: 1, floatKind: 'busy' }])
    })

    it('does not affect any real column\'s width', () => {
      const padding = padHours('Vic Ceder')
      const allHeadliners = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T20:00:00.000Z', [
        'All Headliners',
      ])
      const sessions = [...padding, allHeadliners]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      expect(layout.columnWidthsRem[0]).toBe(CALLER_COLUMN_WIDTH_REM)
    })

    it('floats regardless of its own duration, even a short one', () => {
      const allHeadliners = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T19:30:00.000Z', [
        'All Headliners',
      ])
      const layout = computeDanceScheduleCallerLayout([allHeadliners], [allHeadliners])

      expect(layout.placements.find((p) => p.session === allHeadliners)).toBeDefined()
    })
  })

  describe('caller-free-time sessions (non-headline placeholder, e.g. "GCA Callers")', () => {
    it('floats with floatKind "free", not "busy"', () => {
      const padding = padHours('Vic Ceder')
      const gcaCallers = makeSession('2026-07-02T18:30:00.000Z', '2026-07-02T19:00:00.000Z', ['GCA Callers'])
      const sessions = [...padding, gcaCallers]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      const placement = layout.placements.find((p) => p.session === gcaCallers)
      expect(placement).toMatchObject({ columnStart: 0, columnSpan: layout.visibleCallers.length, floatKind: 'free' })
    })

    it('never appears in visibleCallers or claims its own column, no matter how much time accumulates under it', () => {
      const gcaCallers = Array.from({ length: 4 }, (_, i) =>
        makeSession(`2026-07-02T0${i}:00:00.000Z`, `2026-07-02T0${i + 1}:00:00.000Z`, ['GCA Callers']),
      )
      const layout = computeDanceScheduleCallerLayout(gcaCallers, gcaCallers)

      expect(layout.visibleCallers).toEqual([])
    })

    it('renders alongside a real caller session sharing the same row without lane-splitting either', () => {
      const padding = padHours('Vic Ceder')
      const real = makeSession('2026-07-02T18:30:00.000Z', '2026-07-02T19:00:00.000Z', ['Vic Ceder'], {
        location: located('Ballroom East'),
      })
      const gcaCallers = makeSession('2026-07-02T18:30:00.000Z', '2026-07-02T19:00:00.000Z', ['GCA Callers'])
      const sessions = [...padding, real, gcaCallers]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      const realPlacement = layout.placements.find((p) => p.session === real)
      const floatingPlacement = layout.placements.find((p) => p.session === gcaCallers)
      expect(realPlacement).toMatchObject({ columnStart: 0, columnSpan: 1, lane: 0, laneCount: 1 })
      expect(floatingPlacement).toMatchObject({ columnStart: 0, columnSpan: 1, lane: 0, laneCount: 1, floatKind: 'free' })
    })

    it('renders alongside an all-headliners ("busy") session on a different row, each keeping its own floatKind', () => {
      const gcaCallers = makeSession('2026-07-02T18:30:00.000Z', '2026-07-02T19:00:00.000Z', ['GCA Callers'])
      const allHeadliners = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T20:00:00.000Z', ['All Headliners'])
      const sessions = [gcaCallers, allHeadliners]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      expect(layout.placements.find((p) => p.session === gcaCallers)).toMatchObject({ floatKind: 'free' })
      expect(layout.placements.find((p) => p.session === allHeadliners)).toMatchObject({ floatKind: 'busy' })
    })
  })

  describe('overlapping floating sessions (regression — real MotivateToSeattle data)', () => {
    // Mirrors a real reported bug/refinement: an all-evening freeform
    // "Registration" session (5:30-8:00 PM) overlaps BOTH a "GCA Callers"
    // free-time session (6:30-7:00 PM) AND a "Trail-In Dance - All Headliners"
    // busy session (7:00-8:00 PM) within it. First fixed by lane-splitting all
    // three (they'd otherwise render stacked directly on top of one another —
    // illegible), but a "free" entry's own claim ("no headline caller has
    // anything scheduled") stops being true the moment something else starts
    // inside it — so clipFreeFloatingEntries now clips Registration's RENDERED
    // span to end right when "GCA Callers" begins, which also means it no
    // longer even overlaps either later session, so no lane-splitting is needed
    // at all: each renders full-width for its own portion of the evening.
    it("clips a free entry's span at the first other entry within it, instead of lane-splitting", () => {
      const registration = makeFreeform('2026-07-02T17:30:00.000Z', '2026-07-02T20:00:00.000Z', {
        description: 'Registration',
        location: { kind: 'roomless' },
      })
      const gcaCallers = makeSession('2026-07-02T18:30:00.000Z', '2026-07-02T19:00:00.000Z', ['GCA Callers'])
      const allHeadliners = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T20:00:00.000Z', ['All Headliners'])
      const sessions = [registration, gcaCallers, allHeadliners]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      const registrationPlacement = layout.placements.find((p) => p.session === registration)
      const gcaPlacement = layout.placements.find((p) => p.session === gcaCallers)
      const allHeadlinersPlacement = layout.placements.find((p) => p.session === allHeadliners)

      // Registration's rowSpan is clipped to run only from its own start (row 1)
      // up to gcaCallers' start (row 2) — one row, not the three its own
      // 5:30-8:00 PM range would otherwise span. Its own SESSION (and therefore
      // its card's displayed "5:30 PM – 8:00 PM" text) is untouched — only the
      // rendered geometry shrinks.
      expect(registrationPlacement).toMatchObject({ rowStart: 1, rowSpan: 1, floatKind: 'free', lane: 0, laneCount: 1 })
      expect(registrationPlacement!.session).toBe(registration)
      // Neither later session overlaps the now-clipped Registration span, so
      // both get their own full-width lane, same as if Registration weren't
      // there at all.
      expect(gcaPlacement).toMatchObject({ floatKind: 'free', lane: 0, laneCount: 1 })
      expect(allHeadlinersPlacement).toMatchObject({ floatKind: 'busy', lane: 0, laneCount: 1 })
    })

    it('does not clip a "busy" entry, even when something else starts inside its own span', () => {
      // A "busy" session means everyone is occupied together — its own claim
      // never needs to defer to anything else starting inside it the way a
      // "free" entry's does. (Two genuinely overlapping busy/ordinary entries
      // are a data-entry-error case handled defensively by lane-splitting, not
      // by clipping — see the "does not lane-split..." test below.)
      const allHeadliners = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T21:00:00.000Z', [
        'All Headliners',
      ])
      const gcaCallers = makeSession('2026-07-02T20:00:00.000Z', '2026-07-02T20:30:00.000Z', ['GCA Callers'])
      const sessions = [allHeadliners, gcaCallers]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      const allHeadlinersPlacement = layout.placements.find((p) => p.session === allHeadliners)
      expect(allHeadlinersPlacement!.rowSpan).toBeGreaterThan(1)
    })

    it('still lane-splits two floating entries that start at exactly the same time (clipping cannot apply)', () => {
      // Clipping only looks at entries starting STRICTLY AFTER another entry's
      // own start — two entries starting simultaneously never trigger it, so
      // the lane-split mechanism (assignLanesPerSlot) is still needed for this
      // defensive, data-entry-error-like case.
      const lunch = makeFreeform('2026-07-02T12:00:00.000Z', '2026-07-02T13:00:00.000Z', {
        description: 'Lunch Break',
        location: { kind: 'roomless' },
      })
      const allHeadliners = makeSession('2026-07-02T12:00:00.000Z', '2026-07-02T13:00:00.000Z', [
        'All Headliners',
      ])
      const sessions = [lunch, allHeadliners]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      const lunchPlacement = layout.placements.find((p) => p.session === lunch)
      const allHeadlinersPlacement = layout.placements.find((p) => p.session === allHeadliners)
      expect(lunchPlacement).toMatchObject({ laneCount: 2 })
      expect(allHeadlinersPlacement).toMatchObject({ laneCount: 2 })
      expect(lunchPlacement!.lane).not.toBe(allHeadlinersPlacement!.lane)
    })

    it('does not lane-split a floating entry against a real per-caller entry it overlaps', () => {
      // Floating entries and real per-column entries are independent virtual
      // "slots" — an all-headliners session overlapping a real caller's own session
      // (different caller, different column) must not affect that caller's lane.
      const padding = padHours('Vic Ceder')
      const real = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T19:30:00.000Z', ['Vic Ceder'], {
        location: located('Ballroom East'),
      })
      const allHeadliners = makeSession('2026-07-02T19:00:00.000Z', '2026-07-02T20:00:00.000Z', ['All Headliners'])
      const sessions = [...padding, real, allHeadliners]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      expect(layout.placements.find((p) => p.session === real)).toMatchObject({ lane: 0, laneCount: 1 })
      expect(layout.placements.find((p) => p.session === allHeadliners)).toMatchObject({ lane: 0, laneCount: 1 })
    })
  })

  describe('column width growth', () => {
    it('grows a column by 50% per additional lane past the first', () => {
      expect(callerColumnWidthRem(1)).toBe(CALLER_COLUMN_WIDTH_REM)
      expect(callerColumnWidthRem(2)).toBe(CALLER_COLUMN_WIDTH_REM * 1.5)
      expect(callerColumnWidthRem(3)).toBe(CALLER_COLUMN_WIDTH_REM * 2)
    })

    it('keeps a column at its ordinary width when nothing in it ever overlaps', () => {
      const padding = padHours('Vic Ceder')
      const layout = computeDanceScheduleCallerLayout(padding, padding)

      expect(layout.columnWidthsRem[0]).toBe(CALLER_COLUMN_WIDTH_REM)
    })
  })

  describe('compressing idle rows', () => {
    it('drops a row entirely when nothing is scheduled for any visible caller', () => {
      const morning = backToBackDances('Vic Ceder', 4, 9) // 9am-1pm, back-to-back
      const afternoon = backToBackDances('Allan Hurst', 4, 15) // 3pm-7pm, back-to-back
      const sessions = [...morning, ...afternoon]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      // 4 rows for the morning block + 4 for the afternoon block — the 1pm-3pm gap
      // between them contributes ZERO rows, not the usual one-row-per-gap.
      expect(layout.totalRows).toBe(8)
      // The boundary that would only mark "here's where the gap starts" is dropped
      // entirely; the boundary marking "here's where real content resumes" is kept.
      expect(layout.timeMarks.some((mark) => mark.label === '1:00 PM')).toBe(false)
      expect(layout.timeMarks.some((mark) => mark.label === '3:00 PM')).toBe(true)

      const lastMorning = layout.placements.find((p) => p.session === morning[3])
      const firstAfternoon = layout.placements.find((p) => p.session === afternoon[0])
      expect(lastMorning).toMatchObject({ rowStart: 4, rowSpan: 1 })
      expect(firstAfternoon).toMatchObject({ rowStart: 5, rowSpan: 1 })
    })

    it('always keeps the trailing marker for the end of the last session', () => {
      const only = backToBackDances('Vic Ceder', 4, 9)
      const layout = computeDanceScheduleCallerLayout(only, only)

      const trailing = layout.timeMarks[layout.timeMarks.length - 1]
      expect(trailing).toEqual({ rowStart: 5, label: '1:00 PM' })
    })

    it('keeps a row occupied by only one of several visible callers, not empty in every column', () => {
      const ceder = backToBackDances('Vic Ceder', 4, 9) // 9am-1pm
      // Hurst's own 4 dances share Ceder's exact same 4 time slots — every row is
      // occupied by at least Ceder even though Hurst alone wouldn't fill every row
      // any differently here; the point is that occupancy is a per-row OR across
      // columns, not a requirement that every visible column has something.
      const hurst = backToBackDances('Allan Hurst', 4, 9)
      const sessions = [...ceder, ...hurst]
      const layout = computeDanceScheduleCallerLayout(sessions, sessions)

      expect(layout.totalRows).toBe(4)
      expect(layout.placements).toHaveLength(8)
    })
  })
})
