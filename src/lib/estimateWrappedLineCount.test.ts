import { describe, expect, it } from 'vitest'
import { estimateWrappedLineCount } from './estimateWrappedLineCount'

// A fake measurer, not real canvas measurement — jsdom's canvas 2D context isn't
// implemented in this project's test environment (confirmed live: getContext('2d')
// returns null without the optional `canvas` npm package). 10px per character makes
// widths easy to reason about by hand.
const measureWidth = (text: string) => text.length * 10

describe('estimateWrappedLineCount', () => {
  it('returns 0 for empty or whitespace-only text', () => {
    expect(estimateWrappedLineCount('', 1000, measureWidth)).toBe(0)
    expect(estimateWrappedLineCount('   ', 1000, measureWidth)).toBe(0)
  })

  it('returns 1 line when everything fits within maxWidthPx', () => {
    expect(estimateWrappedLineCount('Ted Lizotte', 1000, measureWidth)).toBe(1)
  })

  it('wraps onto a second line once a word would overflow the width', () => {
    // "Ted" = 30px, "Lizotte" = 70px, space = 10px. "Ted Lizotte" = 110px.
    expect(estimateWrappedLineCount('Ted Lizotte', 100, measureWidth)).toBe(2)
  })

  it('always keeps a single overlong word on its own line rather than looping', () => {
    // A single word wider than maxWidthPx can't be split — it still counts as 1 line.
    expect(estimateWrappedLineCount('Supercalifragilisticexpialidocious', 50, measureWidth)).toBe(1)
  })

  it('wraps each word onto its own line when none fit two abreast', () => {
    expect(estimateWrappedLineCount('aa bb cc', 20, measureWidth)).toBe(3)
  })
})
