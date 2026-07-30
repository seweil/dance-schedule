import { describe, expect, it } from 'vitest'
import { estimateCardFit, shouldCombinePrimaryAndDetails } from './estimateCardFit'

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

describe('estimateCardFit', () => {
  it('reports the uncombined height when everything fits comfortably', () => {
    // 16 padding + 15 primary + 15 details = 46, well under 80 available.
    expect(
      estimateCardFit(
        {
          primaryText: 'SSD',
          detailsText: 'Ted Lizotte',
          hasGcaLine: false,
          availableHeightPx: 80,
          textWidthPx: 1000,
        },
        measureWidth,
      ),
    ).toEqual({ combine: false, neededHeightPx: 46 })
  })

  it('reports the smaller combined-line estimate when combining actually helps', () => {
    // Separately: primary "X" is 1 line; details "AAAAAAA BB CC" wraps to 2 lines at
    // this width (16 padding + 3*15 = 61, over the 50px available -> combine: true).
    // Combined onto one line, the short primary leaves enough leftover width on its
    // own line for the details text to reflow into fewer total lines (2, not 3) --
    // 16 padding + 2*15 = 46, which is the real number a deficit calculation should
    // use, not the pre-combine 61.
    expect(
      estimateCardFit(
        {
          primaryText: 'X',
          detailsText: 'AAAAAAA BB CC',
          hasGcaLine: false,
          availableHeightPx: 50,
          textWidthPx: 100,
        },
        measureWidth,
      ),
    ).toEqual({ combine: true, neededHeightPx: 46 })
  })

  it('reports a still-overflowing needed height when combining is not enough', () => {
    // The documented "GCA Caller Showcase Dance - Michael Maltenfort" case: still
    // needs several wrapped lines even combined onto one line with the primary text,
    // well over the 40px-tall (2-row-unit) card.
    const estimate = estimateCardFit(
      {
        primaryText: 'SSD',
        detailsText: 'GCA Caller Showcase Dance - Michael Maltenfort',
        hasGcaLine: false,
        availableHeightPx: 40,
        textWidthPx: 130,
      },
      measureWidth,
    )
    expect(estimate.combine).toBe(true)
    expect(estimate.neededHeightPx).toBeGreaterThan(40)
  })
})
