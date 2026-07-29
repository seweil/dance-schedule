import contentSets from 'virtual:content-sets'
import danceSessionsData from 'virtual:dance-schedule'
import { buildDanceSchedule } from '../lib/buildDanceSchedule'
import { RawDanceScheduleTable } from './RawDanceScheduleTable'

const buildTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'medium',
})

// The extra `: string[]` annotation works around a TS inference quirk (observed
// with this repo's tsconfig) where `contentSets.sets.map(...)` chained directly,
// with a callback returning JSX, loses element-type inference and reports the
// callback's parameters as implicitly `any` — assigning to an explicitly-typed
// local first resolves it.
const contentSetNames: string[] = contentSets.sets

// Debug-only page (see App.tsx) rendering the parsed dance schedule as a dense
// table, formatted for desktop use — not linked from the nav.
export function RawDanceScheduleDebugPage() {
  return (
    <>
      <p>
        Content sets:{' '}
        {contentSetNames.map((set, index) => (
          <span key={set}>
            {index > 0 ? ' · ' : ''}
            {/* Plain <a>, not react-router's <Link> — each content set is a
                separately built app, so crossing to another set is a full page
                navigation, not a client-side route change. Links to that set's home
                page rather than its own copy of this debug page: a set's `/<set>/`
                is a literal static file, served correctly with no extra hosting
                config, whereas a deep link like `/<set>/debug/dance-schedule` needs
                a per-content-set Amplify rewrite rule that's a manual, easy-to-forget
                step for a brand-new set (see docs/design/hosting.md) — until that's
                added, the deep link 404s/blanks even though the home page works. */}
            <a href={`/${set}/`}>
              {set}
              {set === contentSets.activeSet ? ' (this build)' : ''}
              {set === contentSets.defaultSet ? ' (default)' : ''}
            </a>
          </span>
        ))}
      </p>
      <h1>Dance Schedule — Debug ({contentSets.activeSet})</h1>
      <p>
        Build {__BUILD_NUMBER__} · Compiled {buildTimeFormatter.format(new Date(__BUILD_TIME__))}
      </p>
      <RawDanceScheduleTable sessions={buildDanceSchedule(danceSessionsData)} />
    </>
  )
}
