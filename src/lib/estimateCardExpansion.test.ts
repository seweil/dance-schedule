import { describe, expect, it } from 'vitest'
import { estimateCardRowExpansion, MAX_EXPANSION_ROWS_PER_SESSION } from './estimateCardExpansion'

const measureWidth = (text: string) => text.length * 10

describe('estimateCardRowExpansion', () => {
  it('returns null when the content is estimated to fit comfortably', () => {
    expect(
      estimateCardRowExpansion(
        {
          primaryText: 'SSD',
          detailsText: 'Ted Lizotte',
          hasGcaLine: false,
          availableHeightPx: 80,
          textWidthPx: 1000,
        },
        3,
        4,
        18,
        measureWidth,
      ),
    ).toBeNull()
  })

  it('returns the correct afterRow and row count for a modest deficit', () => {
    // Same fixture as estimateCardFit.test.ts's "still overflows even combined"
    // case: neededHeightPx 106, availableHeightPx 40 -> deficit 66px, ceil(66/18) = 4.
    const result = estimateCardRowExpansion(
      {
        primaryText: 'SSD',
        detailsText: 'GCA Caller Showcase Dance - Michael Maltenfort',
        hasGcaLine: false,
        availableHeightPx: 40,
        textWidthPx: 130,
      },
      3,
      2,
      18,
      measureWidth,
    )
    expect(result).toEqual({ afterRow: 5, rows: 4 })
  })

  it('caps the row count at MAX_EXPANSION_ROWS_PER_SESSION for a pathological deficit', () => {
    const result = estimateCardRowExpansion(
      {
        primaryText: '',
        detailsText:
          'A very long freeform description that goes on and on and on and on and on and on',
        hasGcaLine: false,
        availableHeightPx: 20,
        textWidthPx: 50,
      },
      1,
      1,
      18,
      measureWidth,
    )
    expect(result?.rows).toBe(MAX_EXPANSION_ROWS_PER_SESSION)
  })

  it("anchors the expansion at the placement's trailing edge (rowStart + rowSpan), not its start", () => {
    const result = estimateCardRowExpansion(
      {
        primaryText: '',
        detailsText: 'AAAAAAAAAA BBBBBBBBBB',
        hasGcaLine: false,
        availableHeightPx: 10,
        textWidthPx: 50,
      },
      7,
      3,
      18,
      measureWidth,
    )
    expect(result?.afterRow).toBe(10)
  })

  it('scales the row count with unitHeightPx — a taller unit (e.g. the with-GCA row height) needs fewer extra rows for the same pixel deficit', () => {
    const inputs = {
      primaryText: 'SSD',
      detailsText: 'GCA Caller Showcase Dance - Michael Maltenfort',
      hasGcaLine: false,
      availableHeightPx: 40,
      textWidthPx: 130,
    }
    const shortUnit = estimateCardRowExpansion(inputs, 3, 2, 10, measureWidth)
    const tallUnit = estimateCardRowExpansion(inputs, 3, 2, 1000, measureWidth)
    expect(shortUnit?.rows).not.toBe(tallUnit?.rows)
  })
})
