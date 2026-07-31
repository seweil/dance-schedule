import type { ContentSetInfo } from '../types/contentSets'

// Real events first (alphabetical by displayName), then test-fixture sets
// (alphabetical among themselves) — the /events landing page's ordering
// (EventsListPage.tsx). Pure and separately unit-tested per this repo's
// convention of not testing a page component that's wired directly to a
// virtual:* module (see EventsListPage.tsx's own comment).
export function sortContentSets(sets: ContentSetInfo[]): ContentSetInfo[] {
  return [...sets].sort((a, b) => {
    if (a.testFixture !== b.testFixture) {
      return a.testFixture ? 1 : -1
    }
    return a.displayName.localeCompare(b.displayName)
  })
}
