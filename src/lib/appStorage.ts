// Thin, defensive localStorage wrapper — reads/writes can throw (private browsing,
// quota exceeded, storage disabled by the user/browser) and stored JSON can be
// stale or malformed after a schema or content-set change. Every function degrades
// to "nothing persisted" rather than crashing the app; callers are responsible for
// narrowing/validating whatever readStorageJson returns before trusting it, same as
// any other untrusted input.

export function readStorageJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}

export function writeStorageJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignored — see module comment.
  }
}

// Used by resetAppState.ts (every reset entry point in the app) — a full
// localStorage.clear() (not just this app's own keys) since that's the whole of
// what "storage" means for this app; it has no other client-side persistence.
export function clearAllStorage(): void {
  try {
    localStorage.clear()
  } catch {
    // Ignored — see module comment.
  }
}
