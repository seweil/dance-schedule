import { execSync } from 'node:child_process'
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
import { assertContentSetExists, loadTopLevelContentConfig } from './content-config'

// Baked in at build time (never re-evaluated client-side) so the debug page can
// show which build is running — the short commit hash doubles as a build number
// since this project has no CI-assigned incrementing build counter.
const BUILD_NUMBER = execSync('git rev-parse --short HEAD').toString().trim()
const BUILD_TIME = new Date().toISOString()

// Selects which content/<set>/ directory supplies pages and schedule data for this
// build — see docs/design/content-sets.md and docs/design/content-config.md. Read
// directly from process.env (no loadEnv()/.env file involved anywhere in this repo)
// since it's a plain Node-context build-time switch, never exposed to the client
// bundle. Defaults to content/config.yaml's defaultContentSet (itself "real" if that
// file is absent) so pnpm dev/build/preview/test:e2e behave exactly as before when
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

export default defineConfig({
  base: BASE_PATH,
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
      manifest: false, // manifest is hand-authored at public/manifest.webmanifest
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      workbox: {
        // No navigateFallback override here — vite-plugin-pwa's own default
        // ('index.html', relative) resolves correctly against each build's own
        // `base`/scope. An absolute '/index.html' would incorrectly fall back to
        // the default set's root bundle for offline navigations inside a prefixed
        // set's scope (e.g. /test/) once multiple content sets publish under
        // different base paths — see docs/design/content-sets.md.
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
})
