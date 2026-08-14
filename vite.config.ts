import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import Pages from 'vite-plugin-pages'
import mdx from '@mdx-js/rollup'
import rehypeMdxImportMedia from 'rehype-mdx-import-media'
import remarkGfm from 'remark-gfm'
import { schedulePlugin } from './vite-plugin-schedule'
import { danceSchedulePlugin } from './vite-plugin-dance-schedule'
import { contentConfigPlugin } from './vite-plugin-content-config'
import { contentSetsPlugin } from './vite-plugin-content-sets'
import {
  assertContentSetExists,
  listContentSets,
  loadContentManifestStrings,
  loadTopLevelContentConfig,
} from './content-config'
import { generateContentSetIcons } from './content-icons'

// vite-plugin-pages types its own onRoutesGenerated callback as (routes: any[]) =>
// ... — this is just the shape this file's own hook actually reads/writes on each
// leaf route, not a full re-declaration of the plugin's internal route type.
interface GeneratedPageRoute {
  path: string
  element?: string
  children?: GeneratedPageRoute[]
}

// Baked in at build time (never re-evaluated client-side) so the debug page can
// show which build is running — the short commit hash doubles as a build number
// since this project has no CI-assigned incrementing build counter.
const BUILD_NUMBER = execSync('git rev-parse --short HEAD').toString().trim()
const BUILD_TIME = new Date().toISOString()

// Selects which content/<set>/ directory supplies pages and schedule data for this
// build — see docs/design/content-sets.md and docs/design/content-config.md. Read
// directly from process.env (no loadEnv()/.env file involved anywhere in this repo)
// since it's a plain Node-context build-time switch, never exposed to the client
// bundle. Defaults to content/config.yaml's defaultContentSet (itself
// "automated-testing" if that file is absent) so pnpm dev/build/preview/test:e2e
// behave exactly as before when
// CONTENT_SET is unset. Either way, the resolved name is validated against a real
// content/<name>/ directory here — a typo (env var or config file) fails loudly with
// a named error instead of a raw ENOENT surfacing later from vite-plugin-pages or
// read-excel-file deep inside plugin resolution.
const topLevelContentConfig = loadTopLevelContentConfig(process.cwd())
const CONTENT_SET = process.env.CONTENT_SET || topLevelContentConfig.defaultContentSet
if (process.env.CONTENT_SET) {
  assertContentSetExists(process.cwd(), process.env.CONTENT_SET, 'CONTENT_SET env var')
}
const CONTENT_DIR = `content/${CONTENT_SET}`

// event-schedule.xlsx is optional, per content set — a simple event with
// nothing beyond what the dance-schedule pages already cover (e.g.
// MotivateToSeattle) can just omit it. When absent, the "Event Schedule" page
// and its nav entry are omitted entirely (see the onRoutesGenerated filter
// below and the schedulePlugin registration further down) rather than the
// build failing — see docs/design/schedule-page.md's "event-schedule.xlsx is
// optional" decision. Same existsSync-gated-optionality pattern already used
// for a set's own icon.png (content-icons.ts).
const EVENT_SCHEDULE_FILE = path.join(process.cwd(), CONTENT_DIR, 'data', 'event-schedule.xlsx')
const HAS_EVENT_SCHEDULE = existsSync(EVENT_SCHEDULE_FILE)

// Path prefix this build's assets/routes are served under — "/" for the default
// set's unprefixed mirror, "/<set>/" for every set's own prefixed copy. Set by
// scripts/build-content-sets.mjs per invocation; defaults to "/" so plain
// `vite dev`/`vite build`/`build:test` behave exactly as before when unset. See
// docs/design/content-sets.md.
const BASE_PATH = process.env.BASE_PATH || '/'

export default defineConfig(async () => {
  // Generated per content set (never committed — see .gitignore) so each set's own
  // manifest.webmanifest can reference its own icon files, distinct from every
  // other set's. Replaces the old single shared public/ directory entirely (see
  // docs/design/content-config.md) — vite-plugin-pwa's manifest icons must live
  // under Vite's publicDir, and that can only point at one directory at a time, so
  // it's repointed here instead of the default 'public'.
  const generatedDir = path.resolve(process.cwd(), 'generated-assets', CONTENT_SET)
  await generateContentSetIcons(process.cwd(), CONTENT_DIR, CONTENT_SET, path.join(generatedDir, 'icons'))
  const manifestStrings = loadContentManifestStrings(process.cwd(), CONTENT_DIR)

  return {
    base: BASE_PATH,
    publicDir: generatedDir,
    define: {
      __BUILD_NUMBER__: JSON.stringify(BUILD_NUMBER),
      __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
    server: {
      watch: {
        // Polling (periodically re-stat each file), not the default OS-level
        // change-event watch — root-caused via a direct fs.watch experiment: on
        // macOS, a native file-change watch is bound to the file's inode at
        // watch-setup time, and an "atomic save" (write to a temp file, then
        // rename it over the original — a common pattern specifically to avoid
        // partial-write corruption, used by this project's own tooling among
        // others) swaps in a NEW inode at the same path. The watch doesn't
        // automatically follow that rename, so it goes silently deaf after the
        // very first edit to any given file for the rest of that dev server's
        // life — confirmed with a minimal reproduction (a second edit to the same
        // file produced no fs.watch event at all, even though the first one did).
        // Polling sidesteps this entirely: it re-reads each file directly on its
        // own interval instead of depending on an OS event ever being delivered,
        // so it can't go stale this way. The CPU cost is small for a project this
        // size; robustness against silently-stale HMR is worth more here.
        usePolling: true,
      },
    },
    plugins: [
      // Must run before vite-plugin-pages resolves .md files as route modules.
      {
        enforce: 'pre',
        ...mdx({
          // 'md' format keeps JSX-in-markdown disabled — content authors write plain
          // markdown, and any accidental JSX in content fails the build loudly instead
          // of silently working.
          format: 'md',
          // GFM adds (among other things) pipe-table syntax on top of plain
          // CommonMark — see CLAUDE.md's "Content pipeline" section.
          remarkPlugins: [remarkGfm],
          rehypePlugins: [rehypeMdxImportMedia],
          // Required for the global <img> (and any other element) override via
          // MDXProvider in App.tsx to actually take effect — without this, compiled
          // MDX components ignore React context and only honor a `components` prop
          // passed directly, which vite-plugin-pages' generated routes never pass.
          providerImportSource: '@mdx-js/react',
        }),
      },
      Pages({
        // <CONTENT_DIR>/pages only has .md files and src/pages/ only has .tsx files
        // today, so sharing one extensions list across both dirs doesn't cross-
        // contaminate either.
        dirs: [
          { dir: `${CONTENT_DIR}/pages`, baseRoute: '' },
          { dir: 'src/pages', baseRoute: '' },
        ],
        extensions: ['md', 'tsx'],
        resolver: 'react',
        // vite-plugin-pages' own convention for "this file IS the route '/'" is the
        // literal filename "index" — hardcoded in its route-computation source
        // (computeReactRoutes, isIndexRoute = node.endsWith('index')), not exposed as
        // an option. This project's own convention is "home.md" instead (more
        // obviously "the home page" to a content author than "index.md" — see
        // docs/adding-a-new-event.md), so this hook re-implements the same "/" mapping
        // ourselves for that one filename, running after the plugin's own route
        // computation (onRoutesGenerated receives the final route array, each leaf's
        // source file path already on `.element`) — every OTHER filename still goes
        // through the plugin's own unmodified logic.
        onRoutesGenerated(routes: GeneratedPageRoute[]) {
          for (const route of routes) {
            if (route.element?.endsWith('/home.md')) {
              route.path = '/'
            }
          }
          // No event-schedule.xlsx for this content set — drop the route
          // entirely rather than let it render an empty/broken page. This is
          // what actually makes the page "not exist": vite-plugin-pages'
          // stringifyRoutes walks exactly this returned array to emit one
          // React.lazy(() => import(...)) per route, so a filtered-out route's
          // component (src/pages/10 event-schedule.tsx, and therefore its
          // virtual:schedule import) is never referenced anywhere in the
          // build. Nav.tsx/buildNavTree.ts need no changes — they already
          // derive the menu generically from whatever routes exist.
          return HAS_EVENT_SCHEDULE
            ? routes
            : routes.filter((route) => !route.element?.endsWith('/10 event-schedule.tsx'))
        },
      }),
      // Only registered when the file exists — belt-and-suspenders alongside
      // the route filter above, not redundant with it: if a future bug ever
      // left the route in place despite a missing file, this makes
      // `import 'virtual:schedule'` fail loudly ("failed to resolve import")
      // instead of silently misbehaving, matching this file's own
      // assertContentSetExists fail-loud precedent.
      ...(HAS_EVENT_SCHEDULE ? [schedulePlugin({ dataDir: `${CONTENT_DIR}/data` })] : []),
      danceSchedulePlugin({ dataDir: `${CONTENT_DIR}/data`, contentDir: CONTENT_DIR }),
      // dataDir is the content set's own root (config.yaml sits alongside pages/data,
      // not inside data/) — see docs/design/content-config.md.
      contentConfigPlugin({ dataDir: CONTENT_DIR }),
      contentSetsPlugin({ defaultSet: topLevelContentConfig.defaultContentSet, activeSet: CONTENT_SET }),
      react(),
      VitePWA({
        strategies: 'generateSW',
        registerType: 'prompt',
        injectRegister: null, // registered manually via useRegisterSW for update-prompt UI
        // Computed per content set — name/short_name from that set's config.yaml
        // (manifestStrings), icons from the freshly generated publicDir above.
        // Everything else stays fixed/shared across sets. vite-plugin-pwa injects the
        // <link rel="manifest"> tag itself once this isn't false (base-aware,
        // index.html no longer hand-authors it) — see docs/design/content-config.md.
        manifest: {
          id: '.',
          name: manifestStrings.name,
          short_name: manifestStrings.shortName,
          description: 'TODO: one-line description of what this app does.',
          start_url: '.',
          scope: '.',
          display: 'standalone',
          // No orientation lock — reported live: the installed PWA didn't rotate
          // with the device at all (a manifest orientation lock only applies once
          // installed standalone, not in a regular browser tab, which is why it
          // looked fine there). This app explicitly supports and encourages
          // landscape (RotateDeviceBanner.tsx, plus the extensive orientation-aware
          // CSS cataloged in docs/design/responsive-breakpoints.md) — locking to
          // portrait-primary was an unreviewed default, not a real decision.
          background_color: '#ffffff',
          theme_color: '#0f172a',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        includeAssets: ['icons/*.png'],
        workbox: {
          // No navigateFallback override here — vite-plugin-pwa's own default
          // ('index.html', relative) resolves correctly against each build's own
          // `base`/scope. An absolute '/index.html' would incorrectly fall back to
          // the default set's root bundle for offline navigations inside a prefixed
          // set's scope (e.g. /test/) once multiple content sets publish under
          // different base paths — see docs/design/content-sets.md.
          //
          // The root/default-mirrored build (BASE_PATH "/") is the one exception:
          // its service worker registers with scope "/", a superset of every other
          // content set's own "/<set>/" scope. Without this denylist, that root SW's
          // navigateFallback acts as a catch-all for *any* unmatched navigation
          // within scope "/" — including "/backtrack2abq/...", "/test/...", etc. —
          // and silently serves its own (wrong) cached app shell instead of ever
          // reaching the network, for any visitor who's ever loaded the bare domain
          // in that browser (confirmed: reproduces in a normal browser tab, but not
          // a fresh private one, since a private window has no pre-registered SW to
          // do the shadowing). Excluding every sibling content set's prefix here
          // lets those navigations fall through to the NetworkFirst runtimeCaching
          // rule below instead, which actually reaches the network/Amplify. Other
          // (non-root) builds don't need this — their own scope is already narrowly
          // "/<set>/", so they can't shadow a sibling set's paths in the first place.
          navigateFallbackDenylist:
            BASE_PATH === '/'
              ? listContentSets(process.cwd()).map((set) => new RegExp(`^/${set}/`))
              : undefined,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: { cacheName: 'pages' },
            },
          ],
        },
        devOptions: {
          enabled: false, // SW behavior is only verified against build+preview, per CLAUDE.md
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
      // The second pattern is for repo-root files (content-config.ts,
      // vite-plugin-content-config.ts) — vite-plugin-schedule.ts/
      // vite-plugin-dance-schedule.ts/vite-plugin-content-sets.ts have no tests of
      // their own (covered live via pnpm build/pnpm dev:test instead), so this
      // doesn't pick up anything unexpected.
      include: ['src/**/*.{test,spec}.{ts,tsx}', '*.test.ts'],
      css: true,
      // Informational only (pnpm test:coverage) — nothing enforces a threshold, and
      // CI just uploads the html report as an artifact rather than failing a build
      // on it. Excludes the three root-level Vite plugins the `include` comment
      // above calls out as covered live rather than by a dedicated test (unlike
      // vite-plugin-content-config.ts, which now has one — see
      // vite-plugin-content-config.test.ts — so it's deliberately NOT excluded
      // here), plus config/type/generated files that aren't meaningfully
      // "coverable" logic.
      coverage: {
        provider: 'v8' as const,
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,tsx}', '*.ts'],
        exclude: [
          'src/**/*.{test,spec}.{ts,tsx}',
          'src/**/*.d.ts',
          'src/main.tsx',
          'src/test-setup.ts',
          'src/pages/**',
          '*.config.ts',
          'vite-plugin-schedule.ts',
          'vite-plugin-dance-schedule.ts',
          'vite-plugin-content-sets.ts',
          'scripts/**',
        ],
      },
    },
  }
})
