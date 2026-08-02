// Shared by computeDanceScheduleLevelLayout.ts and computeDanceScheduleCallerLayout.ts —
// extracted at the second consumer, same as computeDanceScheduleTimeAxis.ts's own
// axis-agnostic extraction, and deliberately just as ignorant of domain-specific
// fields (a "slot" here is a level slot to one caller, a caller column to the
// other). See docs/design/dance-schedule.md's "Overlap lanes" decision.
export interface LaneEntry {
  rowStart: number
  rowSpan: number
  // null marks an entry that floats across every column instead of claiming one —
  // it never participates in lane assignment (see assignLanesPerSlot below).
  slotIndex: number | null
  lane: number
  laneCount: number
}

// Greedy interval-scheduling lane assignment within one already-clustered group of
// mutually (transitively) time-overlapping entries in the same column — the same
// algorithm calendar day-views use for concurrent events. Mutates each entry's
// lane/laneCount in place.
export function assignLanes(cluster: LaneEntry[]): void {
  const laneEnds: number[] = [] // exclusive row-end of the last entry placed in each lane
  for (const entry of cluster) {
    const rowEnd = entry.rowStart + entry.rowSpan
    let lane = laneEnds.findIndex((end) => end <= entry.rowStart)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(rowEnd)
    } else {
      laneEnds[lane] = rowEnd
    }
    entry.lane = lane
  }
  const laneCount = laneEnds.length
  for (const entry of cluster) {
    entry.laneCount = laneCount
  }
}

// Assigns lanes independently per slot index — a placement's overlap partners are
// only ever the other entries claiming the *same* column, never a different one.
export function assignLanesPerSlot<T extends LaneEntry>(entries: T[]): void {
  const bySlot = new Map<number, T[]>()
  for (const entry of entries) {
    if (entry.slotIndex === null) {
      continue
    }
    const list = bySlot.get(entry.slotIndex)
    if (list) {
      list.push(entry)
    } else {
      bySlot.set(entry.slotIndex, [entry])
    }
  }

  for (const slotEntries of bySlot.values()) {
    slotEntries.sort((a, b) => a.rowStart - b.rowStart)

    let clusterStart = 0
    while (clusterStart < slotEntries.length) {
      let clusterEnd = clusterStart + 1
      let maxRowEnd = slotEntries[clusterStart]!.rowStart + slotEntries[clusterStart]!.rowSpan
      while (clusterEnd < slotEntries.length && slotEntries[clusterEnd]!.rowStart < maxRowEnd) {
        maxRowEnd = Math.max(
          maxRowEnd,
          slotEntries[clusterEnd]!.rowStart + slotEntries[clusterEnd]!.rowSpan,
        )
        clusterEnd++
      }
      assignLanes(slotEntries.slice(clusterStart, clusterEnd))
      clusterStart = clusterEnd
    }
  }
}
