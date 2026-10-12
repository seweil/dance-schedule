export interface VerticalExtent {
  top: number
  bottom: number
}

// Overlap below this (px) doesn't count — touching edges or a sliver of
// antialiasing shouldn't hide a label that's still fully readable.
export const MIN_LABEL_OVERLAP_PX = 2

/**
 * Which time-axis labels the current-time badge actually covers, by key. Only a
 * real vertical overlap counts — a label merely near the badge stays visible —
 * so the badge never hides more of the axis than it has to.
 */
export function findOverlappedLabels<K>(
  badge: VerticalExtent,
  labels: (VerticalExtent & { key: K })[],
  minOverlapPx = MIN_LABEL_OVERLAP_PX,
): Set<K> {
  const overlapped = new Set<K>()
  for (const label of labels) {
    const overlap = Math.min(badge.bottom, label.bottom) - Math.max(badge.top, label.top)
    if (overlap > minOverlapPx) overlapped.add(label.key)
  }
  return overlapped
}
