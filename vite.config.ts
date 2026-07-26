import { execSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import Pages from 'vite-plugin-pages'
import mdx from '@mdx-js/rollup'
import rehypeMdxImportMedia from 'rehype-mdx-import-media'
import { schedulePlugin } from './vite-plugin-schedule'
import { danceSchedulePlugin } from './vite-plugin-dance-schedule'

// Baked in at build time (never re-evaluated client-side) so the debug page can
// show which build is running — the short commit hash doubles as a build number
// since this project has no CI-assigned incrementing build counter.
const BUILD_NUMBER = execSync('git rev-parse --short HEAD').toString().trim()
const BUILD_TIME = new Date().toISOString()

// Selects which content/<set>/ directory supplies pages and schedule data for this
// build — see docs/design/content-sets.md. Read directly from process.env (no
// loadEnv()/.env file involved anywhere in this repo) since it's a plain Node-context
// build-time switch, never exposed to the client bundle. Defaults to "real" so
// pnpm dev/build/preview/test:e2e behave exactly as before when unset.
const CONTENT_SET = process.env.CONTENT_SET || 'real'
const CONTENT_DIR = `content/${CONTENT_SET}`

export default defineConfig({
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
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: null, // registered manually via useRegisterSW for update-prompt UI
      manifest: false, // manifest is hand-authored at public/manifest.webmanifest
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      workbox: {
        navigateFallback: '/index.html',
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
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: true,
  },
})
