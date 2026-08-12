import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DanceScheduleCallerGrid } from './DanceScheduleCallerGrid'
import type {
  DanceCallerSessionPlacement,
  DanceScheduleCallerLayout,
} from '../lib/computeDanceScheduleCallerLayout'
import { colorForSession } from '../lib/levelColors'
import type { DanceSession, StructuredSession } from '../types/danceSchedule'

vi.mock('./DanceScheduleGrid.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

const STRUCTURED_SESSION: StructuredSession = {
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

const ALL_HEADLINERS_SESSION: StructuredSession = {
  kind: 'structured',
  date: new Date('2026-07-02T00:00:00.000Z'),
  startTime: new Date('2026-07-02T19:00:00.000Z'),
  endTime: new Date('2026-07-02T20:00:00.000Z'),
  location: { kind: 'located', rooms: ['Glacier', 'Horizon'] },
  levels: ['A2', 'C1'],
  eventType: 'Trail-In Dance',
  callers: ['All Headliners'],
}

const GCA_CALLERS_SESSION: StructuredSession = {
  kind: 'structured',
  date: new Date('2026-07-02T00:00:00.000Z'),
  startTime: new Date('2026-07-02T18:30:00.000Z'),
  endTime: new Date('2026-07-02T19:00:00.000Z'),
  location: { kind: 'located', rooms: ['Glacier', 'Horizon'] },
  levels: ['A2', 'C1'],
  eventType: 'Dancing',
  callers: ['GCA Callers'],
}

const LUNCH_BREAK_SESSION: DanceSession = {
  kind: 'freeform',
  date: new Date('2026-07-02T00:00:00.000Z'),
  startTime: new Date('2026-07-02T12:00:00.000Z'),
  endTime: new Date('2026-07-02T13:00:00.000Z'),
  location: { kind: 'roomless' },
  description: 'Lunch Break (on your own)',
}

function placement(
  overrides: Partial<DanceCallerSessionPlacement> = {},
): DanceCallerSessionPlacement {
  return {
    session: STRUCTURED_SESSION,
    rowStart: 3,
    rowSpan: 4,
    columnStart: 0,
    columnSpan: 1,
    lane: 0,
    laneCount: 1,
    floatKind: null,
    ...overrides,
  }
}

function makeLayout(overrides: Partial<DanceScheduleCallerLayout> = {}): DanceScheduleCallerLayout {
  return {
    visibleCallers: ['Ted Lizotte'],
    columnWidthsRem: [9.375],
    totalRows: 8,
    timeMarks: [
      { rowStart: 1, label: '12:00 PM' },
      { rowStart: 3, label: '12:30 PM' },
      { rowStart: 5, label: '1:00 PM' },
    ],
    placements: [placement()],
    ...overrides,
  }
}

describe('DanceScheduleCallerGrid', () => {
  it('renders an empty-state message when there are no placements', () => {
    render(
      <DanceScheduleCallerGrid
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
      <DanceScheduleCallerGrid
        layout={makeLayout({ placements: [] })}
        showGca
        onShowAllLevels={onShowAllLevels}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /show all levels/i }))
    expect(onShowAllLevels).toHaveBeenCalledOnce()
  })

  it('renders a header per visible caller', () => {
    render(
      <DanceScheduleCallerGrid
        layout={makeLayout({ visibleCallers: ['Vic Ceder', 'Allan Hurst'] })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    expect(screen.getByText('Vic Ceder')).toBeInTheDocument()
    expect(screen.getByText('Allan Hurst')).toBeInTheDocument()
  })

  it('renders one label per time-axis mark, all styled uniformly', () => {
    render(<DanceScheduleCallerGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />)
    const noon = screen.getByText('12:00 PM')
    const thirty = screen.getByText('12:30 PM')
    expect(noon).toBeInTheDocument()
    expect(screen.getByText('1:00 PM')).toBeInTheDocument()
    expect(noon).toHaveClass('timeLabel')
    expect(thirty).toHaveClass('timeLabel')
  })

  it('shows level(s) plain above a bold room line — caller is implied by the column, never shown', () => {
    const { container } = render(
      <DanceScheduleCallerGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
    // "Ted Lizotte" legitimately appears once, as this fixture's column header —
    // just never inside the card itself.
    const card = container.querySelector('.card') as HTMLElement
    expect(card).not.toHaveTextContent('Ted Lizotte')
    const levels = container.querySelector('.card p.levels') as HTMLElement
    expect(levels).toHaveTextContent('SSD')
    const details = container.querySelector('.card p.details') as HTMLElement
    expect(details).toHaveTextContent('Ballroom Centre')
    const room = screen.getByText('Ballroom Centre')
    expect(room.tagName).toBe('STRONG')
  })

  it('always renders the levels and details lines separately, even for a long room name', () => {
    // Same reasoning as the room/level grids' own equivalent tests — rows grow to
    // fit content now, so there's no more combining onto one line; a long room name
    // just wraps and grows its row instead.
    const longRoomSession: StructuredSession = {
      ...STRUCTURED_SESSION,
      eventType: 'Dancing',
      location: { kind: 'located', rooms: ['Grand Salon Ballroom Complex East Wing Annex Hall'] },
    }
    const { container } = render(
      <DanceScheduleCallerGrid
        layout={makeLayout({ placements: [placement({ session: longRoomSession })] })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )

    expect(container.querySelector('p.levels')?.textContent).toBe('SSD')
    expect(container.querySelector('p.details')?.textContent).toBe(
      'Grand Salon Ballroom Complex East Wing Annex Hall',
    )
  })

  it('prefixes a non-"Dancing" event type before the bold room, plain text', () => {
    const session: StructuredSession = { ...STRUCTURED_SESSION, eventType: 'Skirt Work Hour' }
    const { container } = render(
      <DanceScheduleCallerGrid
        layout={makeLayout({ placements: [placement({ session })] })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    const details = container.querySelector('.card p.details') as HTMLElement
    expect(details.textContent).toBe('Skirt Work Hour - Ballroom Centre')
    expect(details.querySelector('strong')).toHaveTextContent('Ballroom Centre')
  })

  it('shows the GCA line when showGca is true', () => {
    render(<DanceScheduleCallerGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />)
    expect(screen.getByText('GCA: Tim Stephens')).toBeInTheDocument()
  })

  it('hides the GCA line (but keeps the session) when showGca is false', () => {
    render(
      <DanceScheduleCallerGrid layout={makeLayout()} showGca={false} onShowAllLevels={() => {}} />,
    )
    expect(screen.queryByText(/GCA: Tim Stephens/)).not.toBeInTheDocument()
    expect(screen.getByText('Ballroom Centre')).toBeInTheDocument()
  })

  it('renders header content and body content in separate grids', () => {
    const { container } = render(
      <DanceScheduleCallerGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
    const header = container.querySelector('.roomHeader')
    const timeLabel = container.querySelector('.timeLabel')
    expect(header).toBeInTheDocument()
    expect(timeLabel).toBeInTheDocument()
    expect(header?.closest('.grid')).not.toBe(timeLabel?.closest('.grid'))
  })

  it("uses each column's own (possibly grown) rem width in gridTemplateColumns, not a uniform repeat()", () => {
    const { container } = render(
      <DanceScheduleCallerGrid
        layout={makeLayout({
          visibleCallers: ['Vic Ceder', 'Allan Hurst'],
          columnWidthsRem: [14.0625, 9.375],
        })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    const grid = container.querySelector('.roomHeader')?.closest('.grid') as HTMLElement
    expect(grid.style.gridTemplateColumns).toContain('14.0625rem')
    expect(grid.style.gridTemplateColumns).toContain('9.375rem')
  })

  it('gives header and body grids the identical computed gridTemplateColumns', () => {
    const { container } = render(
      <DanceScheduleCallerGrid
        layout={makeLayout({ visibleCallers: ['Vic Ceder', 'Allan Hurst'] })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    const header = container.querySelector('.roomHeader')
    const timeLabel = container.querySelector('.timeLabel')
    const headerGrid = header?.closest('.grid') as HTMLElement
    const bodyGrid = timeLabel?.closest('.grid') as HTMLElement
    expect(headerGrid.style.gridTemplateColumns).toBe(bodyGrid.style.gridTemplateColumns)
    expect(headerGrid.style.gridTemplateColumns).not.toBe('')
  })

  it("colors a card's background by the session's level, same as the other two grids", () => {
    const { container } = render(
      <DanceScheduleCallerGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
    const card = container.querySelector('.card')
    expect(card).toHaveStyle({ backgroundColor: colorForSession(STRUCTURED_SESSION) })
  })

  it('uses grid rows that size to their content, not a fixed pixel value', () => {
    const { container } = render(
      <DanceScheduleCallerGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
    const bodyGrid = container.querySelector('.timeLabel')?.closest('.grid') as HTMLElement
    expect(bodyGrid.style.gridTemplateRows).toMatch(/^repeat\(\d+, minmax\(\d+px, auto\)\)$/)
  })

  describe('overlap lanes (defensive)', () => {
    it('shrinks and offsets a card via width/marginLeft when laneCount > 1', () => {
      const { container } = render(
        <DanceScheduleCallerGrid
          layout={makeLayout({ placements: [placement({ lane: 1, laneCount: 2 })] })}
          showGca
          onShowAllLevels={() => {}}
        />,
      )
      const card = container.querySelector('.card') as HTMLElement
      expect(card.style.width).toBe('50%')
      expect(card.style.marginLeft).toBe('50%')
    })

    it('does not override width/marginLeft when laneCount is 1', () => {
      const { container } = render(
        <DanceScheduleCallerGrid
          layout={makeLayout({ placements: [placement({ lane: 0, laneCount: 1 })] })}
          showGca
          onShowAllLevels={() => {}}
        />,
      )
      const card = container.querySelector('.card') as HTMLElement
      expect(card.style.width).toBe('')
      expect(card.style.marginLeft).toBe('')
    })
  })

  it('renders one card per placement even when several share the same session (a co-taught session)', () => {
    render(
      <DanceScheduleCallerGrid
        layout={makeLayout({
          visibleCallers: ['Michael Kellogg', 'Terri Sherrer'],
          placements: [placement({ columnStart: 0 }), placement({ columnStart: 1 })],
        })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    expect(screen.getAllByText('Ballroom Centre')).toHaveLength(2)
  })

  describe('floating cards (floatKind !== null)', () => {
    it('renders a "busy" placement with the busy modifier class and bold room text', () => {
      const { container } = render(
        <DanceScheduleCallerGrid
          layout={makeLayout({
            visibleCallers: ['Michael Kellogg'],
            placements: [
              placement({
                session: ALL_HEADLINERS_SESSION,
                columnStart: 0,
                columnSpan: 1,
                floatKind: 'busy',
              }),
            ],
          })}
          showGca
          onShowAllLevels={() => {}}
        />,
      )
      const card = container.querySelector('.roomlessCard') as HTMLElement
      expect(card).toHaveClass('roomlessCard', 'busyFloatingCard')
      const room = screen.getByText('Glacier, Horizon')
      expect(room.tagName).toBe('STRONG')
    })

    it('renders a "free" structured placeholder placement (e.g. "GCA Callers") without the busy modifier, bolding the caller instead of the room', () => {
      const { container } = render(
        <DanceScheduleCallerGrid
          layout={makeLayout({
            visibleCallers: ['Michael Kellogg'],
            placements: [
              placement({
                session: GCA_CALLERS_SESSION,
                columnStart: 0,
                columnSpan: 1,
                floatKind: 'free',
              }),
            ],
          })}
          showGca
          onShowAllLevels={() => {}}
        />,
      )
      const card = container.querySelector('.roomlessCard') as HTMLElement
      expect(card).toHaveClass('roomlessCard')
      expect(card).not.toHaveClass('busyFloatingCard')
      const caller = screen.getByText('GCA Callers')
      expect(caller.tagName).toBe('STRONG')
      expect(screen.queryByText('Glacier, Horizon')).not.toBeInTheDocument()
    })

    it('renders a "free" freeform placement (a break) with its plain description, no busy modifier', () => {
      const { container } = render(
        <DanceScheduleCallerGrid
          layout={makeLayout({
            visibleCallers: ['Michael Kellogg'],
            placements: [
              placement({
                session: LUNCH_BREAK_SESSION,
                columnStart: 0,
                columnSpan: 1,
                floatKind: 'free',
              }),
            ],
          })}
          showGca
          onShowAllLevels={() => {}}
        />,
      )
      const card = container.querySelector('.roomlessCard') as HTMLElement
      expect(card).not.toHaveClass('busyFloatingCard')
      expect(screen.getByText('Lunch Break (on your own)')).toBeInTheDocument()
    })

    it('never shows a GCA line or a time-range line on a floating card, even when showGca is true', () => {
      render(
        <DanceScheduleCallerGrid
          layout={makeLayout({
            visibleCallers: ['Michael Kellogg'],
            placements: [
              placement({
                session: ALL_HEADLINERS_SESSION,
                columnStart: 0,
                columnSpan: 1,
                floatKind: 'busy',
              }),
            ],
          })}
          showGca
          onShowAllLevels={() => {}}
        />,
      )
      // No time-range line — the card's own row height already lines up with the
      // sticky time labels to its left, so restating it would be redundant.
      expect(screen.queryByText('7:00 PM – 8:00 PM')).not.toBeInTheDocument()
      expect(screen.queryByText(/^GCA:/)).not.toBeInTheDocument()
    })

    it('keeps the time range for a floating Registration session, since it can overlap real caller sessions', () => {
      const registrationSession: DanceSession = { ...LUNCH_BREAK_SESSION, description: 'Registration' }
      render(
        <DanceScheduleCallerGrid
          layout={makeLayout({
            visibleCallers: ['Michael Kellogg'],
            placements: [
              placement({
                session: registrationSession,
                columnStart: 0,
                columnSpan: 1,
                floatKind: 'free',
              }),
            ],
          })}
          showGca
          onShowAllLevels={() => {}}
        />,
      )
      expect(screen.getByText('Registration')).toBeInTheDocument()
      expect(screen.getByText('12:00 PM – 1:00 PM')).toBeInTheDocument()
    })
  })
})
