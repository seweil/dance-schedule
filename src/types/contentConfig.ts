// Shared with vite-plugin-content-config.ts (the plugin that produces this shape)
// and src/types/virtual-content-config.d.ts (the ambient declaration for the
// virtual module it resolves to) — mirrors how src/types/danceSchedule.ts is shared
// between vite-plugin-dance-schedule.ts and virtual-dance-schedule.d.ts.
export interface ContentFeatures {
  // Whether the dance-schedule level slider treats A1 and A2 as one combined slot —
  // see docs/design/dance-schedule.md's LevelSlot decision.
  combineA1A2: boolean
  // Same mechanism, for C3B and C4 — merged slot is labeled "C3B+" (square-dance
  // convention for "C3B and above"), not "C3B/C4". See docs/design/dance-schedule.md.
  combineC3BC4: boolean
}

export interface ContentConfigData {
  features: ContentFeatures
}
