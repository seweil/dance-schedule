// True when the app is running installed (standalone) rather than in an
// ordinary browser tab. `display-mode` is the standard cross-browser signal
// (Chrome, Edge, modern Safari); `navigator.standalone` is an older
// iOS-Safari-specific fallback some iOS versions still need — see
// src/vite-env.d.ts for its ambient type (not in TypeScript's DOM lib).
// A plain function, not a hook: standalone/browser doesn't change during a
// session, and this needs to be callable from src/lib/rum.ts too, which
// runs before React mounts.
export function isStandalonePwa(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}
