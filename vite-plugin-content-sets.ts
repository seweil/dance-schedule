import type { Plugin } from 'vite'
import { isTestFixtureContentSet, listContentSets, loadContentManifestStrings } from './content-config'
import type { ContentSetInfo, ContentSetsData } from './src/types/contentSets'

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
// — lets client code (the debug page's cross-set links) enumerate published sets
// without hardcoding them. Unlike contentConfigPlugin, there's no per-set file to
// dev-watch here: the *set of directories under content/* changing during a live
// `pnpm dev` session is an edge case not worth the extra configureServer plumbing.
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
    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        // Each set's own manifest name + test-fixture flag are cheap config.yaml
        // reads (no pages/data loaded) — safe to do for every OTHER set here too,
        // not just the active one, unlike the rest of this build's content
        // pipeline (see this file's own top comment).
        const sets: ContentSetInfo[] = listContentSets(root).map((name) => {
          const contentDir = `content/${name}`
          return {
            name,
            displayName: loadContentManifestStrings(root, contentDir).name,
            testFixture: isTestFixtureContentSet(root, contentDir),
          }
        })
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
