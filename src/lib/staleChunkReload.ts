import { trackEvent } from './rum'

// A deploy replaces every hashed JS chunk, so a tab still running the previous
// build 404s the moment it lazy-loads a route it hasn't visited yet ("Failed to
// fetch dynamically imported module"). Vite dispatches a cancelable
// `vite:preloadError` on window for exactly that; reloading once picks up the new
// build. That's recovery from an already-broken navigation, not a silent content
// swap — the SW update-prompt rule (CLAUDE.md) still governs the normal case.
//
// Guarded so a chunk that's missing for some other reason (a broken deploy) can't
// reload-loop: at most one reload per RELOAD_WINDOW_MS, tracked in sessionStorage
// (per-tab, survives the reload). If storage is unavailable, no reload — the error
// propagates as before and RUM records it. Also no reload while offline: a tab not
// yet SW-controlled would trade an in-app broken route (nav still usable) for the
// browser's own "not connected" page, since the reload itself can't be fetched.
const STORAGE_KEY = 'staleChunkReloadAt'
const RELOAD_WINDOW_MS = 10_000

export function handleStaleChunkError(
  event: Event,
  storage: Storage,
  reload: () => void,
  now: number = Date.now(),
  online: boolean = navigator.onLine,
): void {
  if (!online) return
  try {
    const last = Number(storage.getItem(STORAGE_KEY))
    if (last && now - last < RELOAD_WINDOW_MS) return
    storage.setItem(STORAGE_KEY, String(now))
  } catch {
    return
  }
  event.preventDefault()
  const payload: unknown = (event as Event & { payload?: unknown }).payload
  trackEvent('stale_chunk_reload', { message: payload instanceof Error ? payload.message : String(payload) })
  reload()
}

export function installStaleChunkReload(): void {
  window.addEventListener('vite:preloadError', (event) =>
    handleStaleChunkError(event, sessionStorage, () => window.location.reload()),
  )
}
