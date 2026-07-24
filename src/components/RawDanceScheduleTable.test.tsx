import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    room: 'Kafka/Lamartine',
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
      room: 'Drummond Ballroom',
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

  it('renders an explicit empty-state message when there are no sessions', () => {
    render(<RawDanceScheduleTable sessions={[]} />)
    expect(screen.getByText(/no sessions parsed/i)).toBeInTheDocument()
  })
})
