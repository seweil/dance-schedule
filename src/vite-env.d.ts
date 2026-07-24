/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pages/client-react" />

// Injected via vite.config.ts's `define` — the short git commit hash and the
// build's compile time (ISO string), baked in at build time.
declare const __BUILD_NUMBER__: string
declare const __BUILD_TIME__: string
