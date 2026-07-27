import { describe, expect, it } from 'vitest'
import { shouldCombineLevelAndDetails } from './estimateCardFit'

const measureWidth = (text: string) => text.length * 10

describe('shouldCombineLevelAndDetails', () => {
  it('says no when a level line, a one-line details line, and no GCA line all fit comfortably', () => {
    // 16 padding + 15 level + 15 details = 46, well under 80 available.
    expect(
      shouldCombineLevelAndDetails(
        { levelsText: 'SSD', detailsText: 'Ted Lizotte', hasGcaLine: false, availableHeightPx: 80, textWidthPx: 1000 },
        measureWidth,
      ),
    ).toBe(false)
  })

  it('says yes when the details text wraps to two lines and the card is short', () => {
    // "GCA Caller Showcase Dance - Michael Maltenfort" wraps at a narrow width.
    // 16 padding + 15 level + 15*2 details = 61, over a 40px-tall (2-row-unit) card.
    expect(
      shouldCombineLevelAndDetails(
        {
          levelsText: 'SSD',
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
    // 16 padding + 15 level + 15 details = 46 fits in 50, but + 14 GCA = 60 doesn't.
    const inputs = { levelsText: 'SSD', detailsText: 'Ted Lizotte', textWidthPx: 1000, availableHeightPx: 50 }
    expect(shouldCombineLevelAndDetails({ ...inputs, hasGcaLine: false }, measureWidth)).toBe(false)
    expect(shouldCombineLevelAndDetails({ ...inputs, hasGcaLine: true }, measureWidth)).toBe(true)
  })

  it('never combines away a level line that does not exist in the first place', () => {
    // No level text means levelLines is already 0 — a short, non-wrapping details
    // line plus a comfortable height should never report true.
    expect(
      shouldCombineLevelAndDetails(
        { levelsText: '', detailsText: 'Lunch Break', hasGcaLine: false, availableHeightPx: 80, textWidthPx: 1000 },
        measureWidth,
      ),
    ).toBe(false)
  })
})
