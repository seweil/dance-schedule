import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RawDanceScheduleTable } from './RawDanceScheduleTable'
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
    expect(screen.getByText('Dancing - Vic Ceder')).toBeInTheDocument()
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
    expect(screen.getByText('Leather Tip - Michael Kellogg & Terri Sherrer')).toBeInTheDocument()
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

    it('shows a caller\'s full hour in "Hours by caller" for a solo session', () => {
      render(<RawDanceScheduleTable sessions={[makeSession({ callers: ['Vic Ceder'] })]} />)

      const callerSection = screen.getByRole('heading', { name: 'Hours by caller' }).closest('section')!
      expect(within(callerSection).getByText('Vic Ceder')).toBeInTheDocument()
      expect(within(callerSection).getAllByText('1')).toHaveLength(2) // its one date column + Total
    })

    it('labels each date column and includes a Total column', () => {
      render(<RawDanceScheduleTable sessions={[makeSession()]} />)

      const levelSection = screen.getByRole('heading', { name: 'Hours by level' }).closest('section')!
      expect(within(levelSection).getByText('Thu, Jul 2')).toBeInTheDocument()
      expect(within(levelSection).getByText('Total')).toBeInTheDocument()
    })

    it('has no rows in either summary for a schedule of only freeform sessions', () => {
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
      expect(within(levelSection).queryAllByRole('row')).toHaveLength(1) // header row only
      expect(within(callerSection).queryAllByRole('row')).toHaveLength(1)
    })
  })
})
