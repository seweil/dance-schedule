import { execSync } from 'node:child_process'
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import Pages from 'vite-plugin-pages'
import mdx from '@mdx-js/rollup'
import rehypeMdxImportMedia from 'rehype-mdx-import-media'
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
    plugins: [
      // Must run before vite-plugin-pages resolves .md files as route modules.
      {
        enforce: 'pre',
        ...mdx({
          // 'md' format keeps JSX-in-markdown disabled — content authors write plain
          // markdown, and any accidental JSX in content fails the build loudly instead
          // of silently working.
          format: 'md',
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
      }),
      schedulePlugin({ dataDir: `${CONTENT_DIR}/data` }),
      danceSchedulePlugin({ dataDir: `${CONTENT_DIR}/data` }),
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
          orientation: 'portrait-primary',
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
      // The second pattern is only for repo-root files (content-config.ts) — vite-
      // plugin-schedule.ts/vite-plugin-dance-schedule.ts have no tests of their own
      // (covered live via pnpm build/pnpm dev:test instead), so this doesn't pick up
      // anything unexpected.
      include: ['src/**/*.{test,spec}.{ts,tsx}', '*.test.ts'],
      css: true,
    },
  }
})
