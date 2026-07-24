import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import Pages from 'vite-plugin-pages'
import mdx from '@mdx-js/rollup'
import rehypeMdxImportMedia from 'rehype-mdx-import-media'
import { schedulePlugin } from './vite-plugin-schedule'
import { detailedSchedulePlugin } from './vite-plugin-detailed-schedule'

export default defineConfig({
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
      // content/pages/ only has .md files and src/pages/ only has .tsx files today, so
      // sharing one extensions list across both dirs doesn't cross-contaminate either.
      dirs: [
        { dir: 'content/pages', baseRoute: '' },
        { dir: 'src/pages', baseRoute: '' },
      ],
      extensions: ['md', 'tsx'],
      resolver: 'react',
    }),
    schedulePlugin(),
    detailedSchedulePlugin(),
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
