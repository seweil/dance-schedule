import contentSets from 'virtual:content-sets'
import danceSessionsData from 'virtual:dance-schedule'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import type { ContentSetInfo } from '../types/contentSets'
import { BuildInfo } from './BuildInfo'
import { PageHeader } from './PageHeader'
import { RawDanceScheduleTable } from './RawDanceScheduleTable'

// The extra `: ContentSetInfo[]` annotation works around a TS inference quirk
// (observed with this repo's tsconfig) where `contentSets.sets.map(...)` chained
// directly, with a callback returning JSX, loses element-type inference and
// reports the callback's parameters as implicitly `any` — assigning to an
// explicitly-typed local first resolves it.
const contentSetList: ContentSetInfo[] = contentSets.sets

// Debug-only page (see App.tsx) rendering the parsed dance schedule as a dense
// table, formatted for desktop use — not linked from the nav.
export function RawDanceScheduleDebugPage() {
  return (
    <>
      <p>
        Content sets:{' '}
        {contentSetList.map(({ name }, index) => (
          <span key={name}>
            {index > 0 ? ' · ' : ''}
            {/* Plain <a>, not react-router's <Link> — each content set is a
                separately built app, so crossing to another set is a full page
                navigation, not a client-side route change. Links to that set's home
                page rather than its own copy of this debug page: a set's `/<set>/`
                is a literal static file, served correctly with no extra hosting
                config, whereas a deep link like `/<set>/debug/dance-schedule` needs
                a per-content-set Amplify rewrite rule that's a manual, easy-to-forget
                step for a brand-new set (see docs/design/hosting.md) — until that's
                added, the deep link 404s/blanks even though the home page works.
                Shown as the raw directory name here (not displayName) — this is
                developer tooling, not the user-facing /events list. */}
            <a href={`/${name}/`}>
              {name}
              {name === contentSets.activeSet ? ' (this build)' : ''}
              {name === contentSets.defaultSet ? ' (default)' : ''}
            </a>
          </span>
        ))}
      </p>
      <PageHeader title={`Dance Schedule — Debug (${contentSets.activeSet})`} />
      <BuildInfo />
      <RawDanceScheduleTable sessions={buildDanceSchedule(danceSessionsData)} />
    </>
  )
}
