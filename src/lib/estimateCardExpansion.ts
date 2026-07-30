import { estimateCardFit, type CardFitInputs } from './estimateCardFit'
import type { MeasureTextWidth } from './estimateWrappedLineCount'
import type { RowExpansion } from './computeDanceScheduleTimeAxis'

// A defensive cap, not a tuned "just enough" value — the combine mitigation already
// resolves most real cases to a couple of rows' residual deficit (the worst
// documented case in docs/known-issues.md is ~25px on an 18px unit, ~2 rows).
// Exists to stop one pathologically long details string from stretching the whole
// page's scroll length unboundedly. A session that hits the cap still clips its
// residual overflow exactly as before this feature shipped — a strict improvement
// (less clipping), not a guarantee of zero clipping in every case, the same posture
// as elision (which only ever handles its one known case, not every conceivable
// layout pathology).
export const MAX_EXPANSION_ROWS_PER_SESSION = 4

// Estimates how many extra row-units (if any) a session's card needs beyond its
// real, time-proportional rowSpan to fit its content without clipping — see
// computeDanceScheduleTimeAxis.ts's expandDanceScheduleTimeAxis, which this feeds.
// Returns null when the card's natural rowSpan is already estimated to be enough.
export function estimateCardRowExpansion(
  inputs: CardFitInputs,
  rowStart: number,
  rowSpan: number,
  unitHeightPx: number,
  measureWidth: MeasureTextWidth,
): RowExpansion | null {
  const { neededHeightPx } = estimateCardFit(inputs, measureWidth)
  const deficitPx = neededHeightPx - inputs.availableHeightPx
  if (deficitPx <= 0) {
    return null
  }

  const rows = Math.min(MAX_EXPANSION_ROWS_PER_SESSION, Math.ceil(deficitPx / unitHeightPx))
  return { afterRow: rowStart + rowSpan, rows }
}
