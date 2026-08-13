// Shared with vite-plugin-content-sets.ts (the plugin that produces this shape) and
// src/types/virtual-content-sets.d.ts (the ambient declaration for the virtual
// module it resolves to) — mirrors src/types/contentConfig.ts /
// virtual-content-config.d.ts.
export interface ContentSetsData {
  // Every content/<name>/ directory published — see content-config.ts's
  // listContentSets(), enriched with the per-set display/grouping info the
  // /events landing page needs (EventsListPage.tsx/sortContentSets.ts).
  sets: ContentSetInfo[]
  // content/config.yaml's defaultContentSet — the set also mirrored unprefixed at
  // "/". See docs/design/content-sets.md.
  defaultSet: string
  // The CONTENT_SET this particular build was compiled with.
  activeSet: string
}

export interface ContentSetInfo {
  // content/<name>/ directory name — also this set's own published URL prefix
  // ("/<name>/"), used as the href for its home-page link.
  name: string
  // content/<name>/config.yaml's manifest.name (content-config.ts's
  // loadContentManifestStrings), falling back the same way it does everywhere
  // else that reads it.
  displayName: string
  // content/<name>/config.yaml's testFixture (content-config.ts's
  // isTestFixtureContentSet) — true only for "automated-testing"/"test" today,
  // but read from config rather than hardcoding those names.
  testFixture: boolean
  // This set's own event date range (e.g. "October 9 – 11, 2026"), computed
  // at build time straight from its dance-schedule.xlsx — see
  // vite-plugin-content-sets.ts and formatDanceScheduleDateRange.ts. Not
  // hand-typed anywhere, so it can't drift from the real schedule data.
  // Always null for a testFixture set (see EventsListPage.tsx's own
  // "omit dates for test fixtures" decision) — a fixture's dates are
  // arbitrary/unmaintained, not a real event's, so showing one would be
  // actively misleading rather than just unnecessary.
  dateRange: string | null
}
