import { describe, expect, it } from 'vitest'
import { shouldCombinePrimaryAndDetails } from './estimateCardFit'

const measureWidth = (text: string) => text.length * 10

describe('shouldCombinePrimaryAndDetails', () => {
  it('says no when a primary line, a one-line details line, and no GCA line all fit comfortably', () => {
    // 16 padding + 15 primary + 15 details = 46, well under 80 available.
    expect(
      shouldCombinePrimaryAndDetails(
        {
          primaryText: 'SSD',
          detailsText: 'Ted Lizotte',
          hasGcaLine: false,
          availableHeightPx: 80,
          textWidthPx: 1000,
        },
        measureWidth,
      ),
    ).toBe(false)
  })

  it('says yes when the details text wraps to two lines and the card is short', () => {
    // "GCA Caller Showcase Dance - Michael Maltenfort" wraps at a narrow width.
    // 16 padding + 15 primary + 15*2 details = 61, over a 40px-tall (2-row-unit) card.
    expect(
      shouldCombinePrimaryAndDetails(
        {
          primaryText: 'SSD',
          detailsText: 'GCA Caller Showcase Dance - Michael Maltenfort',
          hasGcaLine: false,
          availableHeightPx: 40,
          textWidthPx: 130,
        },
        measureWidth,
      ),
    ).toBe(true)
  })

  it('accounts for the GCA line pushing a borderline case over the edge', () => {
    // 16 padding + 15 primary + 15 details = 46 fits in 50, but + 14 GCA = 60 doesn't.
    const inputs = {
      primaryText: 'SSD',
      detailsText: 'Ted Lizotte',
      textWidthPx: 1000,
      availableHeightPx: 50,
    }
    expect(shouldCombinePrimaryAndDetails({ ...inputs, hasGcaLine: false }, measureWidth)).toBe(
      false,
    )
    expect(shouldCombinePrimaryAndDetails({ ...inputs, hasGcaLine: true }, measureWidth)).toBe(true)
  })

  it('says yes when the PRIMARY text itself wraps to two lines, not just the details text', () => {
    // A long, multi-word primary label (e.g. a room name like "Drummond Ballroom")
    // needs 2 lines at this width — 16 padding + 15*2 primary + 15 details = 61,
    // over a 50px-tall card. Regression case: primaryLines used to be hardcoded to
    // 1 regardless of primaryText's own length, silently undercounting the needed
    // height whenever the primary text was long enough to wrap on its own (level
    // codes, the room-columns grid's primary text, never were — but room names, the
    // level-columns grid's primary text, can be).
    expect(
      shouldCombinePrimaryAndDetails(
        {
          primaryText: 'Drummond Ballroom',
          detailsText: 'Ted Lizotte',
          hasGcaLine: false,
          availableHeightPx: 50,
          textWidthPx: 130,
        },
        measureWidth,
      ),
    ).toBe(true)
  })

  it('never combines away a primary line that does not exist in the first place', () => {
    // No primary text means primaryLines is already 0 — a short, non-wrapping
    // details line plus a comfortable height should never report true.
    expect(
      shouldCombinePrimaryAndDetails(
        {
          primaryText: '',
          detailsText: 'Lunch Break',
          hasGcaLine: false,
          availableHeightPx: 80,
          textWidthPx: 1000,
        },
        measureWidth,
      ),
    ).toBe(false)
  })
})
