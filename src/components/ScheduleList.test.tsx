import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScheduleList } from './ScheduleList'
import type { ScheduleEvent } from '../types/schedule'

// Mirrors Nav.test.tsx's approach: real CSS is loaded in jsdom (vitest.config.ts sets
// css: true), so mocking the module keeps this test about rendering behavior, not the
// responsive CSS switch (that's covered in Playwright instead).
vi.mock('./ScheduleList.module.css', () => ({
  default: { list: 'list', card: 'card', date: 'date', time: 'time', location: 'location', description: 'description' },
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

  it('renders an explicit empty-state message when there are no events', () => {
    render(<ScheduleList events={[]} />)

    expect(screen.getByText(/no events scheduled/i)).toBeInTheDocument()
  })
})
