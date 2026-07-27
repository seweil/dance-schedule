import { readStorageJson, writeStorageJson } from './appStorage'

const STORAGE_KEY = 'dance-schedule:filters'

export interface StoredDanceScheduleFilters {
  selectedDateISO?: string
  minLevelIndex?: number
  maxLevelIndex?: number
  showGca?: boolean
}

export function loadStoredDanceScheduleFilters(): StoredDanceScheduleFilters {
  return readStorageJson<StoredDanceScheduleFilters>(STORAGE_KEY) ?? {}
}

export function saveDanceScheduleFilters(filters: Required<StoredDanceScheduleFilters>): void {
  writeStorageJson(STORAGE_KEY, filters)
}

// Falls back to the first available date whenever nothing's stored, the stored
// value doesn't parse as a date, or it no longer matches any date in the current
// schedule (e.g. after a content-set update) — never crashes on stale/malformed
// localStorage data.
export function resolveStoredDate(stored: StoredDanceScheduleFilters, dates: Date[]): Date {
  const storedTime = stored.selectedDateISO ? new Date(stored.selectedDateISO).getTime() : NaN
  const match = Number.isNaN(storedTime) ? undefined : dates.find((date) => date.getTime() === storedTime)
  return match ?? dates[0] ?? new Date()
}

// Falls back to the full range whenever the stored indices are missing, not
// integers, out of bounds for the CURRENT slot count (e.g. combineA1A2 toggled
// between visits, changing how many slots there are), or inverted.
export function resolveStoredLevelRange(
  stored: StoredDanceScheduleFilters,
  slotCount: number,
): { minLevelIndex: number; maxLevelIndex: number } {
  const { minLevelIndex, maxLevelIndex } = stored
  if (
    typeof minLevelIndex === 'number' &&
    typeof maxLevelIndex === 'number' &&
    Number.isInteger(minLevelIndex) &&
    Number.isInteger(maxLevelIndex) &&
    minLevelIndex >= 0 &&
    maxLevelIndex < slotCount &&
    minLevelIndex <= maxLevelIndex
  ) {
    return { minLevelIndex, maxLevelIndex }
  }
  return { minLevelIndex: 0, maxLevelIndex: slotCount - 1 }
}

export function resolveStoredShowGca(stored: StoredDanceScheduleFilters): boolean {
  return typeof stored.showGca === 'boolean' ? stored.showGca : true
}
