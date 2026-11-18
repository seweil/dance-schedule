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
  // Folds C1 into the Advanced slot as well, for an event with a lone Challenge
  // session. Defaults to false, unlike the two above — see
  // docs/design/midwinter-festival-2027.md.
  combineAdvancedC1: boolean
}

// content/<set>/config.yaml's `danceSchedule.roomOrder` — see
// src/lib/deriveRoomOrder.ts for what each value means once it reaches that layer.
// Omitted entirely (the common case) means "use the new median-dance-level
// default" — there's no explicit `undefined` variant here since a plain YAML
// object simply omits the key rather than setting it to some literal "default".
export type DanceScheduleRoomOrder = 'spreadsheet' | readonly string[]

export interface DanceScheduleConfig {
  roomOrder?: DanceScheduleRoomOrder
  // `danceSchedule.featuredStaff` — when set, the staff (caller-columns) view
  // shows only these callers and cuers, in this order, instead of every caller.
  // Each must appear in the schedule (checked at build time). See
  // docs/design/midwinter-festival-2027.md.
  featuredStaff?: readonly string[]
}

export interface ContentConfigData {
  features: ContentFeatures
  danceSchedule?: DanceScheduleConfig
}
