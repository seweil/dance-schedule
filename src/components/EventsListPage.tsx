import contentSets from 'virtual:content-sets'
import { sortContentSets } from '../lib/sortContentSets'
import type { ContentSetInfo } from '../types/contentSets'
import { PageHeader } from './PageHeader'
import styles from './EventsListPage.module.css'

// See RawDanceScheduleDebugPage.tsx's identical comment — an explicit local
// annotation works around a TS inference quirk with `.map(...)` chained
// straight off a virtual-module import when the callback returns JSX.
const sortedSets: ContentSetInfo[] = sortContentSets(contentSets.sets)

// User-facing "all events" landing page — reachable via the subtle link
// BuildInfo.tsx adds after the build date, not from Nav (see App.tsx's
// `/events` route, added the same "reachable but not in nav" way as
// `/debug/*`). Not unit-tested itself, per this repo's existing convention
// for a page wired directly to a virtual:* module (see
// RawDanceScheduleDebugPage.tsx, also untested) — the sorting/grouping logic
// that's actually worth testing lives in sortContentSets.ts instead.
export function EventsListPage() {
  return (
    <>
      <PageHeader title="All Events" />
      {import.meta.env.DEV && (
        // pnpm dev only ever resolves one CONTENT_SET per process — there's no
        // multi-prefix routing at all in dev, so every link below is a dead end
        // there (it falls through to whichever set is currently active). Only ever
        // true in `pnpm dev`/`pnpm dev:test` — import.meta.env.DEV is false in a
        // production build, so this never ships.
        <div role="alert" className={styles.devWarning}>
          This is a dev build — the links below won't work here (dev mode only
          serves one event at a time). Run <code>pnpm build &amp;&amp; pnpm preview</code>{' '}
          to review them.
        </div>
      )}
      <ul className={styles.list}>
        {sortedSets.map((set) => (
          <li key={set.name}>
            {/* Plain <a>, not react-router's <Link> — see
                RawDanceScheduleDebugPage.tsx's identical link for why: each
                content set is a separately built app, and only its home page
                ("/<set>/") is guaranteed to resolve without extra hosting
                config (docs/design/hosting.md). */}
            <a href={`/${set.name}/`}>{set.displayName}</a>
            {set.testFixture && <span className={styles.testTag}> (test)</span>}
          </li>
        ))}
      </ul>
    </>
  )
}
