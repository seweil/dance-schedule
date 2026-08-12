import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DanceScheduleLevelGrid } from './DanceScheduleLevelGrid'
import type {
  DanceLevelSessionPlacement,
  DanceScheduleLevelLayout,
} from '../lib/computeDanceScheduleLevelLayout'
import { getLevelSlots } from '../lib/levelOrder'
import { colorForSession, NEUTRAL_CARD_COLOR } from '../lib/levelColors'
import type { DanceSession } from '../types/danceSchedule'

vi.mock('./DanceScheduleGrid.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

const SLOTS = getLevelSlots(false, false)
const COMBINED_SLOTS = getLevelSlots(true, false)
const A1_A2_SLOT_INDEX = COMBINED_SLOTS.findIndex((slot) => slot.label === 'A1/A2')

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

function placement(
  overrides: Partial<DanceLevelSessionPlacement> = {},
): DanceLevelSessionPlacement {
  return {
    session: STRUCTURED_SESSION,
    rowStart: 3,
    rowSpan: 4,
    columnStart: 0,
    columnSpan: 1,
    lane: 0,
    laneCount: 1,
    ...overrides,
  }
}

function makeLayout(overrides: Partial<DanceScheduleLevelLayout> = {}): DanceScheduleLevelLayout {
  return {
    visibleSlots: SLOTS.slice(0, 1), // just "SSD"
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

describe('DanceScheduleLevelGrid', () => {
  it('renders an empty-state message when there are no placements', () => {
    render(
      <DanceScheduleLevelGrid
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
      <DanceScheduleLevelGrid
        layout={makeLayout({ placements: [] })}
        showGca
        onShowAllLevels={onShowAllLevels}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /show all levels/i }))
    expect(onShowAllLevels).toHaveBeenCalledOnce()
  })

  it('renders a header per visible level slot', () => {
    render(
      <DanceScheduleLevelGrid
        layout={makeLayout({ visibleSlots: SLOTS.slice(0, 2) })} // SSD, MS
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    expect(screen.getByText('SSD')).toBeInTheDocument()
    expect(screen.getByText('MS')).toBeInTheDocument()
  })

  it('renders one label per time-axis mark, all styled uniformly', () => {
    render(<DanceScheduleLevelGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />)
    const noon = screen.getByText('12:00 PM')
    const thirty = screen.getByText('12:30 PM')
    expect(noon).toBeInTheDocument()
    expect(screen.getByText('1:00 PM')).toBeInTheDocument()
    // No more hour-vs-half-hour distinction — every mark is just "a real event
    // boundary," so every label shares the same class, no modifier.
    expect(noon).toHaveClass('timeLabel')
    expect(thirty).toHaveClass('timeLabel')
  })

  it('shows the caller/details line above the room line, with the room not bold', () => {
    const { container } = render(
      <DanceScheduleLevelGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
    expect(screen.getByText('Ballroom Centre')).toBeInTheDocument()
    // Never bold — the room isn't this grid's primary label anymore.
    expect(container.querySelector('.card p.levels')).not.toBeInTheDocument()
    const paragraphs = container.querySelectorAll('.card > div > p')
    expect(paragraphs[0]).toHaveTextContent('Ted Lizotte')
    expect(paragraphs[1]).toHaveTextContent('Ballroom Centre')
    const caller = screen.getByText('Ted Lizotte')
    expect(caller.tagName).toBe('STRONG')
  })

  it('prefixes the level(s) in a combined A1/A2 slot, plain text before the bold caller', () => {
    const session: DanceSession = { ...STRUCTURED_SESSION, levels: ['A1'], eventType: 'Dancing' }
    const { container } = render(
      <DanceScheduleLevelGrid
        layout={makeLayout({
          visibleSlots: COMBINED_SLOTS.slice(A1_A2_SLOT_INDEX, A1_A2_SLOT_INDEX + 1),
          placements: [placement({ session })],
        })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    const details = container.querySelector('.card p.details') as HTMLElement
    expect(details).toHaveTextContent('A1 - Ted Lizotte')
    // Only the caller is bold — the level prefix is plain text, same treatment as
    // a non-"Dancing" event type prefix.
    expect(details.querySelector('strong')).toHaveTextContent('Ted Lizotte')
    expect(details.textContent).toBe('A1 - Ted Lizotte')
  })

  it('joins multiple levels in the combined-slot prefix, alongside a non-"Dancing" event type', () => {
    const session: DanceSession = {
      ...STRUCTURED_SESSION,
      levels: ['A1', 'A2'],
      eventType: 'Advanced Hothash',
      callers: ['Justin Russell'],
    }
    const { container } = render(
      <DanceScheduleLevelGrid
        layout={makeLayout({
          visibleSlots: COMBINED_SLOTS.slice(A1_A2_SLOT_INDEX, A1_A2_SLOT_INDEX + 1),
          placements: [placement({ session })],
        })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    const details = container.querySelector('.card p.details') as HTMLElement
    // toContain, not toBe — whether the room line combines onto the same <p>
    // depends on the card-fit estimate, not something this test cares about.
    expect(details.textContent).toContain('A1, A2 - Advanced Hothash - Justin Russell')
    expect(details.querySelector('strong')).toHaveTextContent('Justin Russell')
  })

  it('omits the level prefix in a non-combined (single-level) slot', () => {
    const { container } = render(
      <DanceScheduleLevelGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
    const details = container.querySelector('.card p.details') as HTMLElement
    expect(details.textContent).toBe('Ted Lizotte')
  })

  it('shows the GCA line when showGca is true', () => {
    render(<DanceScheduleLevelGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />)
    expect(screen.getByText('GCA: Tim Stephens')).toBeInTheDocument()
  })

  it('hides the GCA line (but keeps the session) when showGca is false', () => {
    render(
      <DanceScheduleLevelGrid layout={makeLayout()} showGca={false} onShowAllLevels={() => {}} />,
    )
    expect(screen.queryByText(/GCA: Tim Stephens/)).not.toBeInTheDocument()
    expect(screen.getByText('Ted Lizotte')).toBeInTheDocument()
  })

  it('renders a roomless session without a time range (obvious from the time axis) and no room label or GCA line', () => {
    render(
      <DanceScheduleLevelGrid
        layout={makeLayout({
          visibleSlots: [],
          placements: [
            placement({ session: ROOMLESS_SESSION, rowStart: 1, rowSpan: 6, columnSpan: 1 }),
          ],
        })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    expect(screen.getByText('Lunch Break')).toBeInTheDocument()
    expect(screen.queryByText('12:00 PM – 1:30 PM')).not.toBeInTheDocument()
  })

  it('keeps the time range for a roomless Registration session, since it can overlap real dancing', () => {
    const registrationSession: DanceSession = { ...ROOMLESS_SESSION, description: 'Registration' }
    render(
      <DanceScheduleLevelGrid
        layout={makeLayout({
          visibleSlots: [],
          placements: [
            placement({ session: registrationSession, rowStart: 1, rowSpan: 6, columnSpan: 1 }),
          ],
        })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    expect(screen.getByText('Registration')).toBeInTheDocument()
    expect(screen.getByText('12:00 PM – 1:30 PM')).toBeInTheDocument()
  })

  it('renders header content and body content in separate grids', () => {
    const { container } = render(
      <DanceScheduleLevelGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
    const roomHeader = container.querySelector('.roomHeader')
    const timeLabel = container.querySelector('.timeLabel')
    expect(roomHeader).toBeInTheDocument()
    expect(timeLabel).toBeInTheDocument()
    expect(roomHeader?.closest('.grid')).not.toBe(timeLabel?.closest('.grid'))
  })

  it("uses each column's own (possibly grown) rem width in gridTemplateColumns, not a uniform repeat()", () => {
    const { container } = render(
      <DanceScheduleLevelGrid
        layout={makeLayout({ visibleSlots: SLOTS.slice(0, 2), columnWidthsRem: [14.0625, 9.375] })}
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
      <DanceScheduleLevelGrid
        layout={makeLayout({ visibleSlots: SLOTS.slice(0, 2) })}
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

  it("colors a card's background by the session's level, same as the room-columns grid", () => {
    const { container } = render(
      <DanceScheduleLevelGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
    const card = container.querySelector('.card')
    expect(card).toHaveStyle({ backgroundColor: colorForSession(STRUCTURED_SESSION) })
  })

  it('does not color a roomless card by level (keeps the neutral CSS-module background)', () => {
    const { container } = render(
      <DanceScheduleLevelGrid
        layout={makeLayout({
          visibleSlots: [],
          placements: [placement({ session: ROOMLESS_SESSION, rowStart: 1, rowSpan: 6 })],
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
    // Rows grow to fit real card content now (DanceScheduleLevelGrid.tsx's
    // gridTemplateRows) instead of a JS-computed fixed height per showGca state —
    // jsdom doesn't run real CSS layout, so the actual intrinsic height can't be
    // asserted here (see docs/design/dance-schedule.md); this only confirms the
    // track-sizing function itself, not a numeric pixel comparison.
    const { container } = render(
      <DanceScheduleLevelGrid layout={makeLayout()} showGca onShowAllLevels={() => {}} />,
    )
    const bodyGrid = container.querySelector('.timeLabel')?.closest('.grid') as HTMLElement
    expect(bodyGrid.style.gridTemplateRows).toMatch(/^repeat\(\d+, minmax\(\d+px, auto\)\)$/)
  })

  it('always renders the room and details lines separately, even for long text', () => {
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
      <DanceScheduleLevelGrid
        layout={makeLayout({
          placements: [placement({ session: longCallerSession, rowStart: 3, rowSpan: 1 })],
        })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )

    const detailsParagraphs = container.querySelectorAll('p.details')
    expect(detailsParagraphs[0]?.textContent).toBe(
      'Bartholomew Alexander Montgomery Wellington-Smythe',
    )
    expect(detailsParagraphs[1]?.textContent).toBe('Ballroom Centre')
  })

  describe('overlap lanes', () => {
    it('shrinks and offsets a card via width/marginLeft when laneCount > 1', () => {
      const { container } = render(
        <DanceScheduleLevelGrid
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
        <DanceScheduleLevelGrid
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

  it('renders one card per placement even when several share the same session', () => {
    render(
      <DanceScheduleLevelGrid
        layout={makeLayout({
          visibleSlots: SLOTS.slice(0, 2),
          placements: [placement({ columnStart: 0 }), placement({ columnStart: 1 })],
        })}
        showGca
        onShowAllLevels={() => {}}
      />,
    )
    expect(screen.getAllByText('Ted Lizotte')).toHaveLength(2)
  })
})
