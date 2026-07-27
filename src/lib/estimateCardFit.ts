import { estimateWrappedLineCount, type MeasureTextWidth } from './estimateWrappedLineCount'

// Mirrors DanceScheduleGrid.module.css's real, live-measured values: .levels and
// .details each render at a 15px line-box height, .gca at 14px, and .card has 8px
// padding on every side (16px combined top+bottom). Kept here rather than imported
// from the CSS module because CSS values aren't readable from plain TS/test code —
// if the module's spacing changes meaningfully, re-measure and update these too.
const LEVEL_DETAILS_LINE_HEIGHT_PX = 15
const GCA_LINE_HEIGHT_PX = 14
const CARD_VERTICAL_PADDING_PX = 16

export interface CardFitInputs {
  levelsText: string
  detailsText: string
  hasGcaLine: boolean
  availableHeightPx: number
  textWidthPx: number
}

// True if a session card's level, details, and (optional) GCA lines are estimated to
// need more vertical space than the card's actual (time-proportional, fixed)
// available height — in which case the caller should combine the level and details
// text onto one line instead of two to save a line. An estimate (word-wrap simulated
// via measureWidth, not real browser layout) biased to slightly under-count available
// space, since combining when there was room to spare is cosmetically harmless but
// failing to combine when content doesn't actually fit means real clipping — see
// docs/known-issues.md for the pre-existing overflow bug this is meant to help with.
export function shouldCombineLevelAndDetails(
  { levelsText, detailsText, hasGcaLine, availableHeightPx, textWidthPx }: CardFitInputs,
  measureWidth: MeasureTextWidth,
): boolean {
  const detailsLines = estimateWrappedLineCount(detailsText, textWidthPx, measureWidth)
  const levelLines = levelsText ? 1 : 0
  const gcaLines = hasGcaLine ? 1 : 0

  const neededHeightPx =
    CARD_VERTICAL_PADDING_PX +
    levelLines * LEVEL_DETAILS_LINE_HEIGHT_PX +
    detailsLines * LEVEL_DETAILS_LINE_HEIGHT_PX +
    gcaLines * GCA_LINE_HEIGHT_PX

  return neededHeightPx > availableHeightPx
}
