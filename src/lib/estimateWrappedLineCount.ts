export type MeasureTextWidth = (text: string) => number

// Estimates how many lines `text` would take if greedily word-wrapped at
// `maxWidthPx`, given a way to measure a substring's rendered width. An estimate,
// not a browser-accurate line-breaker (no hyphenation, no CJK/no-space-boundary
// support) — good enough to decide whether content is likely to need saving space,
// not for pixel-perfect layout. See src/lib/estimateCardFit.ts for the concrete use.
export function estimateWrappedLineCount(
  text: string,
  maxWidthPx: number,
  measureWidth: MeasureTextWidth,
): number {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return 0
  }

  const spaceWidth = measureWidth(' ')
  let lines = 1
  let currentLineWidth = 0

  for (const word of words) {
    const wordWidth = measureWidth(word)
    const widthIfAppended = currentLineWidth === 0 ? wordWidth : currentLineWidth + spaceWidth + wordWidth

    if (widthIfAppended > maxWidthPx && currentLineWidth > 0) {
      lines += 1
      currentLineWidth = wordWidth
    } else {
      currentLineWidth = widthIfAppended
    }
  }

  return lines
}
