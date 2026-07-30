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

export interface CardFitEstimate {
  // True if the primary and details text should be combined onto one line instead
  // of two — see shouldCombinePrimaryAndDetails below, unchanged for every existing
  // call site.
  combine: boolean
  // The estimated needed height of whichever arrangement will actually render (the
  // combined line, when `combine` is true and primary text exists; the separate
  // primary/details lines otherwise) — the real basis for an overflow deficit (see
  // estimateCardExpansion.ts), not just the pre-combine sum.
  neededHeightPx: number
}

// Estimates whether a session card's primary, details, and (optional) GCA lines
// need more vertical space than the card's actual (time-proportional, fixed)
// available height — in which case the caller should combine the primary and
// details text onto one line instead of two to save a line — and how much space
// whichever arrangement actually renders is estimated to need. An estimate
// (word-wrap simulated via measureWidth, not real browser layout) biased to
// slightly under-count available space, since combining when there was room to
// spare is cosmetically harmless but failing to combine when content doesn't
// actually fit means real clipping — see docs/known-issues.md for the pre-existing
// overflow bug this is meant to help with.
export function estimateCardFit(
  { primaryText, detailsText, hasGcaLine, availableHeightPx, textWidthPx }: CardFitInputs,
  measureWidth: MeasureTextWidth,
): CardFitEstimate {
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

  const combine = uncombinedHeightPx > availableHeightPx
  if (!combine || !primaryText) {
    return { combine, neededHeightPx: uncombinedHeightPx }
  }

  // Only estimated once combining is actually the outcome, and only when there's a
  // primary line to combine with — mirrors the real combined markup (level/room
  // text followed by the details text on one line), so the deficit a caller
  // computes against this number reflects what will really render, not the
  // pre-combine sum.
  const combinedLines = estimateWrappedLineCount(
    `${primaryText} ${detailsText}`,
    textWidthPx,
    measureWidth,
  )
  return { combine, neededHeightPx: gcaHeightPx + combinedLines * PRIMARY_DETAILS_LINE_HEIGHT_PX }
}

// Thin wrapper kept for every existing call site — behavior-preserving, unchanged.
export function shouldCombinePrimaryAndDetails(
  inputs: CardFitInputs,
  measureWidth: MeasureTextWidth,
): boolean {
  return estimateCardFit(inputs, measureWidth).combine
}
