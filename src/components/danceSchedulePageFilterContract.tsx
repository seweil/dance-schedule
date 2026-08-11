import type { ComponentType } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TextSizeProvider } from './TextSizeProvider'

// Exercises the filter wiring shared, byte-identically, by all three dance-schedule
// pages (useDanceScheduleFilters -> DanceScheduleFilters -> grid, see
// docs/design/dance-schedule.md) — run once per page via
// testDanceSchedulePageFilters rather than duplicated three times, since the wiring
// itself doesn't differ between pages. Renders against the REAL "automated-testing"
// content set (pnpm test always pins CONTENT_SET to it, see CLAUDE.md) rather than
// mocking virtual:dance-schedule/virtual:content-config, so these facts come
// straight from content/automated-testing/data/dance-schedule.xlsx — the same
// fixture e2e/room-schedule.spec.ts already asserts against.
//
// Deliberately does NOT test the "Show all levels" empty-state link here: narrowing
// the level range alone can't reach a true zero-placement state anywhere in this
// fixture, on any date, for any of the three views — every date has at least one
// session exempt from level filtering (an unordered level like "Various"/"Intro", or
// a freeform session like "Lunch Break"), and isSessionInLevelRange makes those
// unconditionally visible regardless of the range (confirmed empirically, not just
// theorized). That link's actual click behavior is already covered at the grid-
// component layer (DanceScheduleGrid/DanceScheduleLevelGrid/DanceScheduleCallerGrid
// tests, using hand-built empty layouts), so nothing is lost by not re-proving it
// here through the real data.
//
// Not a *.test.tsx file itself — deliberately outside vitest's `include` glob (see
// vite.config.ts) so importing this module doesn't register a second, empty test
// suite; each page's own thin *Page.test.tsx file calls this directly.
export function testDanceSchedulePageFilters(pageName: string, Page: ComponentType) {
  function renderPage() {
    return render(
      <MemoryRouter>
        <TextSizeProvider>
          <Page />
        </TextSizeProvider>
      </MemoryRouter>,
    )
  }

  describe(`${pageName} filter wiring (shared contract)`, () => {
    it("renders the default (earliest) date's content with at least one column", () => {
      renderPage()
      // "roomHeader" is the literal, shared CSS class every column header uses in
      // all three grids, whatever the column actually represents (room/level/caller)
      // — see DanceScheduleGrid.module.css.
      expect(document.querySelectorAll('[class*="roomHeader"]').length).toBeGreaterThan(0)
    })

    it('changing the date select swaps the grid to that date', () => {
      renderPage()
      // Compares the grid panel's own rendered text wholesale rather than pinning to
      // one specific session's text: a fact like "All Callers Dance" (Friday-only)
      // doesn't work as a shared, page-agnostic check here, since the caller view
      // renders it as a floating cross-column card with different text than the
      // room/level views' own cards for the same session (see
      // isAllHeadlinersSession in computeDanceScheduleCallerLayout.ts). Scoped to
      // "panelWrapper" (shared by all three grids), not document.body, since the
      // date <select>'s own selected option text changes regardless of whether the
      // grid itself updates.
      const panel = document.querySelector('[class*="panelWrapper"]')
      const textBeforeSwitch = panel?.textContent

      fireEvent.change(screen.getByLabelText('Date'), {
        target: { value: new Date('2026-07-03T00:00:00.000Z').toISOString() },
      })

      expect(document.querySelector('[class*="panelWrapper"]')?.textContent).not.toBe(textBeforeSwitch)
    })

    it('narrowing the minimum level hides some now out-of-range columns', () => {
      renderPage()
      const columnCountBefore = document.querySelectorAll('[class*="roomHeader"]').length

      const minThumb = screen.getByRole('slider', { name: /minimum level/i })
      minThumb.focus()
      // 7 — "C3B+"'s slot index once combineA1A2/combineC3BC4 each merge their pair
      // into one stop (this content set has both flags on), the last of 8 slots.
      for (let i = 0; i < 7; i++) {
        fireEvent.keyDown(minThumb, { key: 'ArrowRight' })
      }
      expect(minThumb).toHaveAttribute('aria-valuenow', '7')

      const columnCountAfter = document.querySelectorAll('[class*="roomHeader"]').length
      expect(columnCountAfter).toBeLessThan(columnCountBefore)
    })

    it('unchecking "Show GCA callers" hides the GCA line without hiding the session', () => {
      renderPage()
      expect(screen.getAllByText(/^GCA:/).length).toBeGreaterThan(0)

      fireEvent.click(screen.getByLabelText(/show gca callers/i))

      expect(screen.queryAllByText(/^GCA:/)).toHaveLength(0)
    })
  })
}
