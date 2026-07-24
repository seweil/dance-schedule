import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScheduleList } from './ScheduleList'
import type { ScheduleEvent } from '../types/schedule'

// Mirrors Nav.test.tsx's approach: real CSS is loaded in jsdom (vitest.config.ts sets
// css: true), so mocking the module keeps this test about rendering behavior, not the
// responsive CSS switch (that's covered in Playwright instead).
vi.mock('./ScheduleList.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

function makeEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    date: new Date('2026-08-15T00:00:00.000Z'),
    startTime: new Date('2026-08-15T18:00:00.000Z'),
    endTime: new Date('2026-08-15T19:30:00.000Z'),
    location: 'Studio A',
    description: 'Beginner Salsa',
    ...overrides,
  }
}

describe('ScheduleList', () => {
  it('renders a card for each event', () => {
    render(
      <ScheduleList
        events={[
          makeEvent({ description: 'Beginner Salsa' }),
          makeEvent({ description: 'Bachata Night' }),
        ]}
      />,
    )

    expect(screen.getByText('Beginner Salsa')).toBeInTheDocument()
    expect(screen.getByText('Bachata Night')).toBeInTheDocument()
  })

  it('renders event details', () => {
    render(<ScheduleList events={[makeEvent()]} />)

    expect(screen.getByText('Studio A')).toBeInTheDocument()
    expect(screen.getByText(/6:00\s*PM.*7:30\s*PM/)).toBeInTheDocument()
  })

  it('renders the date once as a section heading, not repeated per card', () => {
    render(
      <ScheduleList
        events={[
          makeEvent({ description: 'Morning class' }),
          makeEvent({ description: 'Afternoon class' }),
        ]}
      />,
    )

    expect(screen.getAllByText(/Aug 15, 2026/)).toHaveLength(1)
    expect(screen.getByRole('heading', { name: /Aug 15, 2026/ })).toBeInTheDocument()
  })

  it('renders a separate heading for each distinct date', () => {
    render(
      <ScheduleList
        events={[
          makeEvent({
            date: new Date('2026-08-15T00:00:00.000Z'),
            startTime: new Date('2026-08-15T18:00:00.000Z'),
            description: 'Day one class',
          }),
          makeEvent({
            date: new Date('2026-08-16T00:00:00.000Z'),
            startTime: new Date('2026-08-16T18:00:00.000Z'),
            description: 'Day two class',
          }),
        ]}
      />,
    )

    expect(screen.getByRole('heading', { name: /Aug 15, 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Aug 16, 2026/ })).toBeInTheDocument()
  })

  it('renders an explicit empty-state message when there are no events', () => {
    render(<ScheduleList events={[]} />)

    expect(screen.getByText(/no events scheduled/i)).toBeInTheDocument()
  })
})
