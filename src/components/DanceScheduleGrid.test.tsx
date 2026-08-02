import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
    totalRows: 8,
    timeMarks: [
      { rowStart: 1, label: '12:00 PM' },
      { rowStart: 3, label: '12:30 PM' },
      { rowStart: 5, label: '1:00 PM' },
    ],
    placements: [
      { session: STRUCTURED_SESSION, rowStart: 3, rowSpan: 4, columnStart: 0, columnSpan: 1 },
    ],
    ...overrides,
  }
}

describe('DanceScheduleGrid', () => {
  it('renders an empty-state message when there are no placements', () => {
    render(
      <DanceScheduleGrid
        layout={makeLayout({ placements: [] })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    expect(screen.getByText(/no sessions match the current filters/i)).toBeInTheDocument()
  })

  it('calls onShowAllLevels when the empty-state link is clicked', () => {
    const onShowAllLevels = vi.fn()
    render(
      <DanceScheduleGrid
        layout={makeLayout({ placements: [] })}
        showGca
        onShowAllLevels={onShowAllLevels}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /show all levels/i }))
    expect(onShowAllLevels).toHaveBeenCalledOnce()
  })

  it('renders a room header per visible room', () => {
    render(
      <DanceScheduleGrid
        layout={makeLayout({ visibleRooms: ['Ballroom Centre', 'Ballroom East'] })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    expect(screen.getByText('Ballroom Centre')).toBeInTheDocument()
    expect(screen.getByText('Ballroom East')).toBeInTheDocument()
  })

  it('renders one label per time-axis mark, all styled uniformly', () => {
    render(<DanceScheduleGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />)
    const noon = screen.getByText('12:00 PM')
    const thirty = screen.getByText('12:30 PM')
    expect(noon).toBeInTheDocument()
    expect(screen.getByText('1:00 PM')).toBeInTheDocument()
    // No more hour-vs-half-hour distinction — every mark is just "a real event
    // boundary," so every label shares the same class, no modifier.
    expect(noon).toHaveClass('timeLabel')
    expect(thirty).toHaveClass('timeLabel')
  })

  it('renders a structured session card with levels and details, omitting the redundant "Dancing" prefix', () => {
    render(<DanceScheduleGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />)
    expect(screen.getByText('SSD')).toBeInTheDocument()
    expect(screen.queryByText(/Dancing -/)).not.toBeInTheDocument()
    const caller = screen.getByText('Ted Lizotte')
    expect(caller).toBeInTheDocument()
    expect(caller.tagName).toBe('STRONG')
  })

  it('keeps a non-"Dancing" event type as a plain-text prefix before the bold caller name', () => {
    render(
      <DanceScheduleGrid
        layout={makeLayout({
          placements: [
            {
              session: { ...STRUCTURED_SESSION, eventType: 'Skirt Work Hour' },
              rowStart: 3,
              rowSpan: 4,
              columnStart: 0,
              columnSpan: 1,
            },
          ],
        })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    expect(screen.getByText(/Skirt Work Hour -/)).toBeInTheDocument()
    const caller = screen.getByText('Ted Lizotte')
    expect(caller.tagName).toBe('STRONG')
  })

  it('shows the GCA line when showGca is true', () => {
    render(<DanceScheduleGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />)
    expect(screen.getByText('GCA: Tim Stephens')).toBeInTheDocument()
  })

  it('hides the GCA line (but keeps the session) when showGca is false', () => {
    render(<DanceScheduleGrid layout={makeLayout()} showGca={false} onShowAllLevels={() => {}} />)
    expect(screen.queryByText(/GCA: Tim Stephens/)).not.toBeInTheDocument()
    expect(screen.getByText('Ted Lizotte')).toBeInTheDocument()
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
        onShowAllLevels={() => {}}
      />,
    )
    expect(screen.getByText('Lunch Break')).toBeInTheDocument()
    expect(screen.getByText('12:00 PM – 1:30 PM')).toBeInTheDocument()
  })

  it('renders header content (corner, room headers) and body content (time labels, cards) in separate grids', () => {
    const { container } = render(
      <DanceScheduleGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
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
        onShowAllLevels={() => {}}
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
    const { container } = render(
      <DanceScheduleGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
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
        onShowAllLevels={() => {}}
      />,
    )
    const card = container.querySelector('.roomlessCard') as HTMLElement
    expect(card.style.backgroundColor).toBe('')
    expect(colorForSession(ROOMLESS_SESSION)).toBe(NEUTRAL_CARD_COLOR)
  })

  it('uses grid rows that size to their content, not a fixed pixel value', () => {
    // Rows grow to fit real card content now (DanceScheduleGrid.tsx's
    // gridTemplateRows) instead of a JS-computed fixed height per showGca state —
    // jsdom doesn't run real CSS layout, so the actual intrinsic height can't be
    // asserted here (see docs/design/dance-schedule.md); this only confirms the
    // track-sizing function itself, not a numeric pixel comparison.
    const { container } = render(
      <DanceScheduleGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
    const bodyGrid = container.querySelector('.timeLabel')?.closest('.grid') as HTMLElement
    expect(bodyGrid.style.gridTemplateRows).toMatch(/^repeat\(\d+, minmax\(\d+px, auto\)\)$/)
  })

  it('always renders the level and details lines separately, even for long text', () => {
    // The old "combine onto one line" workaround only existed to dodge a fixed row
    // height — rows grow to fit content now, so there's no more combining; a long
    // caller name just wraps and grows its row instead (a CSS line-clamp caps
    // genuinely pathological text — see DanceScheduleGrid.module.css).
    const longCallerSession: DanceSession = {
      ...STRUCTURED_SESSION,
      eventType: 'Dancing',
      callers: ['Bartholomew Alexander Montgomery Wellington-Smythe'],
    }
    const { container } = render(
      <DanceScheduleGrid
        layout={makeLayout({
          placements: [
            { session: longCallerSession, rowStart: 3, rowSpan: 1, columnStart: 0, columnSpan: 1 },
          ],
        })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )

    expect(container.querySelector('p.levels')?.textContent).toBe('SSD')
    expect(container.querySelector('p.details')?.textContent).toBe(
      'Bartholomew Alexander Montgomery Wellington-Smythe',
    )
  })

  it('keeps the level and details lines separate when the card has plenty of room', () => {
    const longCallerSession: DanceSession = {
      ...STRUCTURED_SESSION,
      eventType: 'Dancing',
      callers: ['Michael Maltenfort'],
    }
    const { container } = render(
      <DanceScheduleGrid
        layout={makeLayout({
          // A tall (8-row) card has plenty of vertical room even if the caller name
          // wraps to a second line.
          placements: [
            { session: longCallerSession, rowStart: 3, rowSpan: 8, columnStart: 0, columnSpan: 1 },
          ],
        })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )

    expect(container.querySelector('p.levels')?.textContent).toBe('SSD')
    expect(container.querySelector('p.details')?.textContent).toBe('Michael Maltenfort')
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
        onShowAllLevels={() => {}}
      />,
    )
    expect(screen.getAllByText('Ted Lizotte')).toHaveLength(2)
  })
})
