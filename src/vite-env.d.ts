/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pages/client-react" />

// Injected via vite.config.ts's `define` — the short git commit hash and the
// build's compile time (ISO string), baked in at build time.
declare const __BUILD_NUMBER__: string
declare const __BUILD_TIME__: string

// Set as Amplify build-time environment variables when infra/monitoring.yaml
// is deployed — see infra/README.md and src/lib/rum.ts. Absent (undefined)
// in local dev and any build predating that deploy.
interface ImportMetaEnv {
  readonly VITE_RUM_APP_MONITOR_ID?: string
  readonly VITE_RUM_IDENTITY_POOL_ID?: string
  readonly VITE_RUM_REGION?: string
}
