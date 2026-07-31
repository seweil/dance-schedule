import { estimateWrappedLineCount, type MeasureTextWidth } from './estimateWrappedLineCount'

// Mirrors DanceScheduleGrid.module.css's real, live-measured values: .levels and
// .details each render at a 15px line-box height, .gca at 14px, and .card has 8px
// padding on every side (16px combined top+bottom). Kept here rather than imported
// from the CSS module because CSS values aren't readable from plain TS/test code —
// if the module's spacing changes meaningfully, re-measure and update these too.
const PRIMARY_DETAILS_LINE_HEIGHT_PX = 15
const GCA_LINE_HEIGHT_PX = 14
const CARD_VERTICAL_PADDING_PX = 16

export interface CardFitInputs {
  // The bold "primary" line — a session's level(s) in the room-columns grid, or its
  // room in the level-columns grid. The function itself is axis-agnostic; it's
  // shared by both.
  primaryText: string
  detailsText: string
  hasGcaLine: boolean
  availableHeightPx: number
  textWidthPx: number
}

// Estimates whether a session card's primary, details, and (optional) GCA lines need
// more vertical space than the card's actual available height — in which case the
// caller should combine the primary and details text onto one line instead of two to
// save a line. An estimate (word-wrap simulated via measureWidth, not real browser
// layout) biased to slightly under-count available space, since combining when there
// was room to spare is cosmetically harmless but failing to combine when content
// doesn't actually fit means real clipping — see docs/known-issues.md for the
// overflow risk this is meant to help with (rows have a fixed height, not one that
// grows to fit content — see docs/design/dance-schedule.md's "the axis is not a
// clock" decision for why growing rows via native HTML/CSS sizing is deferred
// future work, not handled here).
export function shouldCombinePrimaryAndDetails(
  { primaryText, detailsText, hasGcaLine, availableHeightPx, textWidthPx }: CardFitInputs,
  measureWidth: MeasureTextWidth,
): boolean {
  const gcaLines = hasGcaLine ? 1 : 0
  const gcaHeightPx = CARD_VERTICAL_PADDING_PX + gcaLines * GCA_LINE_HEIGHT_PX

  const detailsLines = estimateWrappedLineCount(detailsText, textWidthPx, measureWidth)
  // Estimated the same way as detailsLines, not hardcoded to 1 — level codes (the
  // room-columns grid's primary text) are always short enough that this was always
  // 1 in practice, but room names (the level-columns grid's primary text, e.g.
  // "Jarry/Joyce") can be long enough to wrap themselves, which a fixed "1" silently
  // ignored, undercounting the needed height and leaving real cards uncombined when
  // they shouldn't have been.
  const primaryLines = primaryText
    ? estimateWrappedLineCount(primaryText, textWidthPx, measureWidth)
    : 0
  const uncombinedHeightPx =
    gcaHeightPx + (primaryLines + detailsLines) * PRIMARY_DETAILS_LINE_HEIGHT_PX

  return uncombinedHeightPx > availableHeightPx
}
