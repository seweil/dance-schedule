import { readStorageJson, writeStorageJson } from './appStorage'

const STORAGE_KEY = 'dance-schedule:rotate-banner-dismissed'

// Shared by useRotateBannerDismissed.ts (per-schedule-page, reads/writes on
// dismiss and on re-entering portrait) and useResetRotateBannerOnLandscape.ts
// (App.tsx-global, the sole authority for clearing it on leaving portrait) —
// pulled into its own module, same pattern as danceScheduleFiltersStorage.ts,
// so the two hooks can't drift on the storage key or read/write shape.
export function loadRotateBannerDismissed(): boolean {
  return readStorageJson<boolean>(STORAGE_KEY) === true
}

export function saveRotateBannerDismissed(dismissed: boolean): void {
  writeStorageJson(STORAGE_KEY, dismissed)
}
