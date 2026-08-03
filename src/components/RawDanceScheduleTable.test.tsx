import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RawDanceScheduleTable } from './RawDanceScheduleTable'
import { colorForSession, NEUTRAL_CARD_COLOR } from '../lib/levelColors'
import type { DanceSession, StructuredSession } from '../types/danceSchedule'

// Mirrors ScheduleList.test.tsx's approach: mock the CSS module so this test is
// about rendering behavior, not styling.
vi.mock('./RawDanceScheduleTable.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

function makeSession(overrides: Partial<StructuredSession> = {}): StructuredSession {
  return {
    kind: 'structured',
    date: new Date('2026-07-02T00:00:00.000Z'),
    startTime: new Date('2026-07-02T12:30:00.000Z'),
    endTime: new Date('2026-07-02T13:30:00.000Z'),
    location: { kind: 'located', rooms: ['Kafka/Lamartine'] },
    levels: ['C1', 'C2'],
    eventType: 'Dancing',
    callers: ['Vic Ceder'],
    ...overrides,
  }
}

describe('RawDanceScheduleTable', () => {
  it('renders a date heading and a table row per session', () => {
    render(<RawDanceScheduleTable sessions={[makeSession()]} />)

    expect(screen.getByRole('heading', { name: /Thursday, July 2, 2026/ })).toBeInTheDocument()
    expect(screen.getByText('Kafka/Lamartine')).toBeInTheDocument()
    expect(screen.getByText('C1, C2')).toBeInTheDocument()
    expect(screen.getByText('Vic Ceder').closest('td')).toHaveTextContent('Dancing - Vic Ceder')
  })

  it('renders the GCA column when present', () => {
    render(<RawDanceScheduleTable sessions={[makeSession({ gca: 'Tim Stephens' })]} />)
    expect(screen.getByText('Tim Stephens')).toBeInTheDocument()
  })

  it('renders multiple co-primary callers joined by "&"', () => {
    render(
      <RawDanceScheduleTable
        sessions={[makeSession({ eventType: 'Leather Tip', callers: ['Michael Kellogg', 'Terri Sherrer'] })]}
      />,
    )
    expect(screen.getByText('Michael Kellogg & Terri Sherrer').closest('td')).toHaveTextContent(
      'Leather Tip - Michael Kellogg & Terri Sherrer',
    )
  })

  it('renders a freeform session distinctly, with no levels or GCA', () => {
    const freeform: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-04T00:00:00.000Z'),
      startTime: new Date('2026-07-04T21:00:00.000Z'),
      endTime: new Date('2026-07-04T21:30:00.000Z'),
      location: { kind: 'located', rooms: ['Drummond Ballroom'] },
      description: 'Country Western Dance - until 1am',
    }
    render(<RawDanceScheduleTable sessions={[freeform]} />)
    expect(screen.getByText('(freeform) Country Western Dance - until 1am')).toBeInTheDocument()
  })

  it('renders a separate section per distinct date', () => {
    render(
      <RawDanceScheduleTable
        sessions={[
          makeSession({ date: new Date('2026-07-02T00:00:00.000Z') }),
          makeSession({
            date: new Date('2026-07-03T00:00:00.000Z'),
            startTime: new Date('2026-07-03T12:30:00.000Z'),
          }),
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: /Thursday, July 2, 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Friday, July 3, 2026/ })).toBeInTheDocument()
  })

  it('renders a placeholder for a roomless session instead of a blank cell', () => {
    render(<RawDanceScheduleTable sessions={[makeSession({ location: { kind: 'roomless' } })]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it("renders a multi-room session's rooms joined by \", \"", () => {
    render(
      <RawDanceScheduleTable
        sessions={[
          makeSession({ location: { kind: 'located', rooms: ['Ballroom Centre', 'Ballroom East'] } }),
        ]}
      />,
    )
    expect(screen.getByText('Ballroom Centre, Ballroom East')).toBeInTheDocument()
  })

  it('renders an explicit empty-state message when there are no sessions', () => {
    render(<RawDanceScheduleTable sessions={[]} />)
    expect(screen.getByText(/no sessions parsed/i)).toBeInTheDocument()
  })

  it('bolds the headline caller name but not the GCA', () => {
    render(<RawDanceScheduleTable sessions={[makeSession({ gca: 'Tim Stephens' })]} />)
    expect(screen.getByText('Vic Ceder').tagName).toBe('STRONG')
    expect(screen.getByText('Tim Stephens').tagName).not.toBe('STRONG')
  })

  it("colors a structured session's Level(s) cell using the shared level palette", () => {
    const session = makeSession({ levels: ['C1', 'C2'] })
    render(<RawDanceScheduleTable sessions={[session]} />)
    expect(screen.getByText('C1, C2')).toHaveStyle({ backgroundColor: colorForSession(session) })
  })

  it('shades an entire freeform row with the neutral card color', () => {
    const freeform: DanceSession = {
      kind: 'freeform',
      date: new Date('2026-07-04T00:00:00.000Z'),
      startTime: new Date('2026-07-04T21:00:00.000Z'),
      endTime: new Date('2026-07-04T21:30:00.000Z'),
      location: { kind: 'located', rooms: ['Drummond Ballroom'] },
      description: 'Country Western Dance - until 1am',
    }
    render(<RawDanceScheduleTable sessions={[freeform]} />)
    const row = screen.getByText('(freeform) Country Western Dance - until 1am').closest('tr')!
    expect(row).toHaveStyle({ backgroundColor: NEUTRAL_CARD_COLOR })
  })

  it('sorts rows by time, then room, regardless of input order', () => {
    render(
      <RawDanceScheduleTable
        sessions={[
          makeSession({
            location: { kind: 'located', rooms: ['Room B'] },
            startTime: new Date('2026-07-02T12:30:00.000Z'),
          }),
          makeSession({
            location: { kind: 'located', rooms: ['Room A'] },
            startTime: new Date('2026-07-02T12:30:00.000Z'),
          }),
          makeSession({
            location: { kind: 'located', rooms: ['Room A'] },
            startTime: new Date('2026-07-02T11:00:00.000Z'),
          }),
        ]}
      />,
    )

    const section = screen.getByRole('heading', { name: /Thursday, July 2, 2026/ }).closest('section')!
    const rows = within(section).getAllByRole('row').slice(1) // drop the header row
    const roomCells = rows.map((row) => within(row).getAllByRole('cell')[1]!.textContent)
    expect(roomCells).toEqual(['Room A', 'Room A', 'Room B'])
  })

  it('alternates Time-column shading for each distinct block of same-start-time rows', () => {
    render(
      <RawDanceScheduleTable
        sessions={[
          makeSession({ location: { kind: 'located', rooms: ['Room A'] } }), // 12:30 block
          makeSession({ location: { kind: 'located', rooms: ['Room B'] } }), // same 12:30 block
          makeSession({
            location: { kind: 'located', rooms: ['Room A'] },
            startTime: new Date('2026-07-02T14:00:00.000Z'),
            endTime: new Date('2026-07-02T15:00:00.000Z'),
          }), // distinct, later block
        ]}
      />,
    )

    const section = screen.getByRole('heading', { name: /Thursday, July 2, 2026/ }).closest('section')!
    const rows = within(section).getAllByRole('row').slice(1) // drop the header row
    const timeCells = rows.map((row) => within(row).getAllByRole('cell')[0]!)
    expect(timeCells[0]).toHaveClass('timeBlockShaded')
    expect(timeCells[1]).toHaveClass('timeBlockShaded')
    expect(timeCells[2]).not.toHaveClass('timeBlockShaded')
  })

  it("marks each time block's first row for a heavier border, but not the rows after it", () => {
    render(
      <RawDanceScheduleTable
        sessions={[
          makeSession({ location: { kind: 'located', rooms: ['Room A'] } }), // 12:30 block
          makeSession({ location: { kind: 'located', rooms: ['Room B'] } }), // same 12:30 block
          makeSession({
            location: { kind: 'located', rooms: ['Room A'] },
            startTime: new Date('2026-07-02T14:00:00.000Z'),
            endTime: new Date('2026-07-02T15:00:00.000Z'),
          }), // distinct, later block
        ]}
      />,
    )

    const section = screen.getByRole('heading', { name: /Thursday, July 2, 2026/ }).closest('section')!
    const rows = within(section).getAllByRole('row').slice(1) // drop the header row
    expect(rows[0]).toHaveClass('timeBlockStart')
    expect(rows[1]).not.toHaveClass('timeBlockStart')
    expect(rows[2]).toHaveClass('timeBlockStart')
  })

  describe('hour summaries', () => {
    it('renders both summaries before the full schedule', () => {
      render(<RawDanceScheduleTable sessions={[makeSession()]} />)

      const headings = screen.getAllByRole('heading').map((heading) => heading.textContent)
      expect(headings).toEqual(['Hours by level', 'Hours by caller', 'Thursday, July 2, 2026'])
    })

    it('splits a multi-level session\'s hour evenly across a "Hours by level" row each', () => {
      render(<RawDanceScheduleTable sessions={[makeSession({ levels: ['C1', 'C2'] })]} />)

      const levelSection = screen.getByRole('heading', { name: 'Hours by level' }).closest('section')!
      expect(within(levelSection).getAllByText('0.5')).toHaveLength(4) // C1 and C2, each dated + total column
    })

    it('shows a caller\'s full hour in "Hours by caller" for a solo session, and rows are days not labels', () => {
      render(
        <RawDanceScheduleTable
          sessions={[
            makeSession({
              startTime: new Date('2026-07-02T12:00:00.000Z'),
              endTime: new Date('2026-07-02T16:00:00.000Z'), // 4 hours — clears MIN_CALLER_HOURS
              callers: ['Vic Ceder'],
            }),
          ]}
        />,
      )

      const callerSection = screen.getByRole('heading', { name: 'Hours by caller' }).closest('section')!
      expect(within(callerSection).getByRole('columnheader', { name: 'Vic Ceder' })).toBeInTheDocument()
      expect(within(callerSection).getByText('Thu, Jul 2')).toBeInTheDocument()
      expect(within(callerSection).getAllByText('4')).toHaveLength(4) // date row's Vic Ceder + Total cells, Total row's same two
    })

    it('excludes a caller at or under the 3-hour threshold from the caller summary', () => {
      render(
        <RawDanceScheduleTable
          sessions={[
            makeSession({
              startTime: new Date('2026-07-02T12:00:00.000Z'),
              endTime: new Date('2026-07-02T15:00:00.000Z'), // exactly 3 hours
              callers: ['Vic Ceder'],
            }),
          ]}
        />,
      )

      const callerSection = screen.getByRole('heading', { name: 'Hours by caller' }).closest('section')!
      expect(within(callerSection).queryByText('Vic Ceder')).not.toBeInTheDocument()
    })

    it('labels each date column and includes a Total row and column', () => {
      render(<RawDanceScheduleTable sessions={[makeSession()]} />)

      const levelSection = screen.getByRole('heading', { name: 'Hours by level' }).closest('section')!
      expect(within(levelSection).getByText('Thu, Jul 2')).toBeInTheDocument()
      expect(within(levelSection).getByRole('columnheader', { name: 'Total' })).toBeInTheDocument()
      expect(within(levelSection).getAllByText('Total')).toHaveLength(2) // the Total column header + the Total row's own label
    })

    it('has no level/caller columns for a schedule of only freeform sessions, just a Date/Total row', () => {
      const freeform: DanceSession = {
        kind: 'freeform',
        date: new Date('2026-07-02T00:00:00.000Z'),
        startTime: new Date('2026-07-02T12:00:00.000Z'),
        endTime: new Date('2026-07-02T13:00:00.000Z'),
        location: { kind: 'roomless' },
        description: 'Lunch Break',
      }
      render(<RawDanceScheduleTable sessions={[freeform]} />)

      const levelSection = screen.getByRole('heading', { name: 'Hours by level' }).closest('section')!
      const callerSection = screen.getByRole('heading', { name: 'Hours by caller' }).closest('section')!
      // Just "Date" and "Total" — no level/caller columns in between.
      expect(within(levelSection).getAllByRole('columnheader')).toHaveLength(2)
      expect(within(callerSection).getAllByRole('columnheader')).toHaveLength(2)
    })
  })
})
