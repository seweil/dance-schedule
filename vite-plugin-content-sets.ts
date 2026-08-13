import path from 'node:path'
import type { Plugin } from 'vite'
import { isTestFixtureContentSet, listContentSets, loadContentManifestStrings } from './content-config'
import { formatDanceScheduleDateRange } from './src/lib/formatDanceScheduleDateRange'
import type { ContentSetInfo, ContentSetsData } from './src/types/contentSets'
import { loadDanceScheduleData } from './vite-plugin-dance-schedule'

export const CONTENT_SETS_VIRTUAL_MODULE_ID = 'virtual:content-sets'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + CONTENT_SETS_VIRTUAL_MODULE_ID

export interface ContentSetsPluginOptions {
  // content/config.yaml's defaultContentSet — the set also mirrored unprefixed at
  // "/". See docs/design/content-sets.md.
  defaultSet: string
  // The CONTENT_SET this particular build was compiled with.
  activeSet: string
}

// Resolves virtual:content-sets to every content/<name>/ directory that exists at
// build time, plus which one is the default and which one this particular build is
// — lets client code (the debug page's cross-set links, EventsListPage.tsx) enumerate
// published sets without hardcoding them. Unlike contentConfigPlugin, there's no
// per-set file to dev-watch here: the *set of directories under content/* changing
// during a live `pnpm dev` session is an edge case not worth the extra
// configureServer plumbing — this includes each real set's own dance-schedule.xlsx
// (read here for `dateRange`, below), left unwatched the same way.
//
// Real cross-set coupling this introduces, accepted deliberately: since this module
// is resolved in EVERY build regardless of which CONTENT_SET is active, a broken
// (unparseable) dance-schedule.xlsx in ANY real set now fails EVERY set's build, not
// just its own — a wider blast radius than before `dateRange` existed, when only
// config.yaml (cheap, always-valid-shape) was read for other sets. Accepted because
// dance-schedule.xlsx is required for every real set already (see CLAUDE.md), so a
// set whose own file doesn't parse can't successfully ship on its own either — this
// just surfaces that failure at a different (any) build instead of only its own.
//
// Also registers a `vite preview` middleware handling two gaps confirmed
// empirically, both stemming from `vite preview`'s SPA fallback being a single
// global rule (always serves the *root*/default bundle's index.html, regardless of
// which prefix was requested):
//   1. A bare "/<set>" (no trailing slash — the natural way to type or bookmark a
//      set's URL) doesn't resolve to that set's directory index; redirected to
//      "/<set>/" here.
//   2. A deeper client-side route under a set's own prefix (e.g. "/real/test", or
//      any route that isn't a literal file — including one that doesn't actually
//      exist, like this example) isn't a real file on disk either — only that
//      set's own index.html is — so it falls through to the wrong bundle too.
//      Rewritten here to that set's own index.html so its own router (not root's)
//      decides whether the route exists.
// Both would otherwise render a silently blank page under the *wrong* set's bundle
// — not a 404, which would at least be diagnosable. Amplify needs equivalent
// redirect/rewrite rules in production, since this middleware only covers local
// `vite preview` testing; see docs/design/hosting.md.
export function contentSetsPlugin(options: ContentSetsPluginOptions): Plugin {
  let root = process.cwd()

  return {
    name: 'content-sets',
    configResolved(config) {
      root = config.root
    },
    resolveId(id) {
      if (id === CONTENT_SETS_VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
    },
    async load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        // Each set's own manifest name + test-fixture flag are cheap config.yaml
        // reads (no pages/data loaded) — safe to do for every OTHER set here too,
        // not just the active one, unlike the rest of this build's content
        // pipeline (see this file's own top comment).
        //
        // dateRange is the one exception: it DOES read+parse every OTHER real
        // set's own dance-schedule.xlsx (via loadDanceScheduleData, the same
        // parse-and-validate pipeline danceSchedulePlugin's own virtual:dance-
        // schedule uses — just without that plugin's OWN further steps, e.g.
        // writing dance-schedule-dump.md, which are specific to the actively
        // built set, not every other one too). Deliberately NOT a hand-typed
        // config.yaml string (see content/MotivateToSeattle/config.yaml's own
        // comment) — computing it from the real schedule data means it can
        // never drift from what that event's dance-schedule.xlsx actually
        // says. Skipped entirely for a testFixture set: its dates are
        // arbitrary/unmaintained fixture data, not a real event's, so
        // EventsListPage.tsx never has anything to show there anyway.
        const sets: ContentSetInfo[] = await Promise.all(
          listContentSets(root).map(async (name) => {
            const contentDir = `content/${name}`
            const testFixture = isTestFixtureContentSet(root, contentDir)
            let dateRange: string | null = null
            if (!testFixture) {
              const danceScheduleFile = path.resolve(root, contentDir, 'data/dance-schedule.xlsx')
              const sessions = await loadDanceScheduleData(danceScheduleFile)
              dateRange = formatDanceScheduleDateRange(sessions.map((session) => new Date(session.date)))
            }
            return {
              name,
              displayName: loadContentManifestStrings(root, contentDir).name,
              testFixture,
              dateRange,
            }
          }),
        )
        const data: ContentSetsData = {
          sets,
          defaultSet: options.defaultSet,
          activeSet: options.activeSet,
        }
        return `export default ${JSON.stringify(data)}`
      }
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const [pathname = '', search] = (req.url ?? '').split('?')
        const sets = listContentSets(root)

        const bareSet = sets.find((name) => pathname === `/${name}`)
        if (bareSet) {
          res.statusCode = 301
          res.setHeader('Location', `/${bareSet}/${search ? `?${search}` : ''}`)
          res.end()
          return
        }

        const scopedSet = sets.find((name) => pathname.startsWith(`/${name}/`))
        const lastSegment = pathname.split('/').pop() ?? ''
        if (scopedSet && pathname !== `/${scopedSet}/` && !lastSegment.includes('.')) {
          req.url = `/${scopedSet}/index.html`
        }

        next()
      })
    },
  }
}
