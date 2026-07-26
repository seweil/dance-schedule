import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DanceScheduleGrid } from './DanceScheduleGrid'
import type { DanceScheduleLayout } from '../lib/computeDanceScheduleLayout'
import { colorForSession, NEUTRAL_CARD_COLOR } from '../lib/levelColors'
import type { DanceSession } from '../types/danceSchedule'

vi.mock('./DanceScheduleGrid.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

const STRUCTURED_SESSION: DanceSession = {
  kind: 'structured',
  date: new Date('2026-07-02T00:00:00.000Z'),
  startTime: new Date('2026-07-02T12:30:00.000Z'),
  endTime: new Date('2026-07-02T13:30:00.000Z'),
  location: { kind: 'located', rooms: ['Ballroom Centre'] },
  levels: ['SSD'],
  eventType: 'Dancing',
  callers: ['Ted Lizotte'],
  gca: 'Tim Stephens',
}

const ROOMLESS_SESSION: DanceSession = {
  kind: 'freeform',
  date: new Date('2026-07-02T00:00:00.000Z'),
  startTime: new Date('2026-07-02T12:00:00.000Z'),
  endTime: new Date('2026-07-02T13:30:00.000Z'),
  location: { kind: 'roomless' },
  description: 'Lunch Break',
}

function makeLayout(overrides: Partial<DanceScheduleLayout> = {}): DanceScheduleLayout {
  return {
    visibleRooms: ['Ballroom Centre'],
    totalRowUnits: 8,
    hourMarks: [
      { rowStart: 1, label: '12:00 PM' },
      { rowStart: 5, label: '1:00 PM' },
    ],
    halfHourMarks: [3],
    placements: [
      { session: STRUCTURED_SESSION, rowStart: 3, rowSpan: 4, columnStart: 0, columnSpan: 1 },
    ],
    ...overrides,
  }
}

describe('DanceScheduleGrid', () => {
  it('renders an empty-state message when there are no placements', () => {
    render(<DanceScheduleGrid layout={makeLayout({ placements: [] })} showGca />)
    expect(screen.getByText(/no sessions match the current filters/i)).toBeInTheDocument()
  })

  it('renders a room header per visible room', () => {
    render(
      <DanceScheduleGrid
        layout={makeLayout({ visibleRooms: ['Ballroom Centre', 'Ballroom East'] })}
        showGca
      />,
    )
    expect(screen.getByText('Ballroom Centre')).toBeInTheDocument()
    expect(screen.getByText('Ballroom East')).toBeInTheDocument()
  })

  it('renders hour-mark labels for the time axis', () => {
    render(<DanceScheduleGrid layout={makeLayout()} showGca />)
    expect(screen.getByText('12:00 PM')).toBeInTheDocument()
    expect(screen.getByText('1:00 PM')).toBeInTheDocument()
  })

  it('renders a structured session card with levels and details', () => {
    render(<DanceScheduleGrid layout={makeLayout()} showGca />)
    expect(screen.getByText('SSD')).toBeInTheDocument()
    expect(screen.getByText('Dancing - Ted Lizotte')).toBeInTheDocument()
  })

  it('shows the GCA line when showGca is true', () => {
    render(<DanceScheduleGrid layout={makeLayout()} showGca />)
    expect(screen.getByText('GCA: Tim Stephens')).toBeInTheDocument()
  })

  it('hides the GCA line (but keeps the session) when showGca is false', () => {
    render(<DanceScheduleGrid layout={makeLayout()} showGca={false} />)
    expect(screen.queryByText(/GCA: Tim Stephens/)).not.toBeInTheDocument()
    expect(screen.getByText('Dancing - Ted Lizotte')).toBeInTheDocument()
  })

  it('renders a roomless session with its time range and no GCA line', () => {
    render(
      <DanceScheduleGrid
        layout={makeLayout({
          visibleRooms: [],
          placements: [
            { session: ROOMLESS_SESSION, rowStart: 1, rowSpan: 6, columnStart: 0, columnSpan: 1 },
          ],
        })}
        showGca
      />,
    )
    expect(screen.getByText('Lunch Break')).toBeInTheDocument()
    expect(screen.getByText('12:00 PM – 1:30 PM')).toBeInTheDocument()
  })

  it('renders a half-hour tick between the hour marks', () => {
    const { container } = render(<DanceScheduleGrid layout={makeLayout()} showGca />)
    const tick = container.querySelector('.halfHourTick')
    expect(tick).toBeInTheDocument()
    // No header row in bodyGrid to offset past anymore — layout.rowStart (3 here, per
    // makeLayout's halfHourMarks) maps directly to the CSS grid row.
    expect(tick).toHaveStyle({ gridRow: '3' })
  })

  it('renders header content (corner, room headers) and body content (time labels, cards) in separate grids', () => {
    const { container } = render(<DanceScheduleGrid layout={makeLayout()} showGca />)
    const roomHeader = container.querySelector('.roomHeader')
    const timeLabel = container.querySelector('.timeLabel')
    expect(roomHeader).toBeInTheDocument()
    expect(timeLabel).toBeInTheDocument()
    // Neither shares the other's nearest ".grid" ancestor — confirms headerGrid and
    // bodyGrid are genuinely separate grid containers, not one shared grid.
    expect(roomHeader?.closest('.grid')).not.toBe(timeLabel?.closest('.grid'))
  })

  it('gives header and body grids the identical computed gridTemplateColumns', () => {
    const { container } = render(
      <DanceScheduleGrid
        layout={makeLayout({ visibleRooms: ['Ballroom Centre', 'Ballroom East'] })}
        showGca
      />,
    )
    const roomHeader = container.querySelector('.roomHeader')
    const timeLabel = container.querySelector('.timeLabel')
    const headerGrid = roomHeader?.closest('.grid') as HTMLElement
    const bodyGrid = timeLabel?.closest('.grid') as HTMLElement
    expect(headerGrid.style.gridTemplateColumns).toBe(bodyGrid.style.gridTemplateColumns)
    expect(headerGrid.style.gridTemplateColumns).not.toBe('')
  })

  it("colors a room card's background by the session's level", () => {
    const { container } = render(<DanceScheduleGrid layout={makeLayout()} showGca />)
    const card = container.querySelector('.card')
    expect(card).toHaveStyle({ backgroundColor: colorForSession(STRUCTURED_SESSION) })
  })

  it('does not color a roomless card by level (keeps the neutral CSS-module background)', () => {
    const { container } = render(
      <DanceScheduleGrid
        layout={makeLayout({
          visibleRooms: [],
          placements: [
            { session: ROOMLESS_SESSION, rowStart: 1, rowSpan: 6, columnStart: 0, columnSpan: 1 },
          ],
        })}
        showGca
      />,
    )
    const card = container.querySelector('.roomlessCard') as HTMLElement
    expect(card.style.backgroundColor).toBe('')
    expect(colorForSession(ROOMLESS_SESSION)).toBe(NEUTRAL_CARD_COLOR)
  })

  it('renders one card per placement even when several share the same session', () => {
    render(
      <DanceScheduleGrid
        layout={makeLayout({
          visibleRooms: ['Ballroom Centre', 'Ballroom West'],
          placements: [
            { session: STRUCTURED_SESSION, rowStart: 3, rowSpan: 4, columnStart: 0, columnSpan: 1 },
            { session: STRUCTURED_SESSION, rowStart: 3, rowSpan: 4, columnStart: 1, columnSpan: 1 },
          ],
        })}
        showGca
      />,
    )
    expect(screen.getAllByText('Dancing - Ted Lizotte')).toHaveLength(2)
  })
})
