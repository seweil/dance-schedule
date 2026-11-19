import { readStorageJson, writeStorageJson } from './appStorage'

const STORAGE_KEY = 'dance-schedule:filters'

export interface StoredDanceScheduleFilters {
  selectedDateISO?: string
  minLevelIndex?: number
  maxLevelIndex?: number
  minPhaseIndex?: number
  maxPhaseIndex?: number
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
function resolveStoredRange(
  min: number | undefined,
  max: number | undefined,
  count: number,
): { min: number; max: number } {
  if (
    typeof min === 'number' &&
    typeof max === 'number' &&
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    min >= 0 &&
    max < count &&
    min <= max
  ) {
    return { min, max }
  }
  return { min: 0, max: count - 1 }
}

export function resolveStoredLevelRange(
  stored: StoredDanceScheduleFilters,
  slotCount: number,
): { minLevelIndex: number; maxLevelIndex: number } {
  const { min, max } = resolveStoredRange(stored.minLevelIndex, stored.maxLevelIndex, slotCount)
  return { minLevelIndex: min, maxLevelIndex: max }
}

// The phase slider's counterpart, against the fixed phase scale (phaseOrder.ts).
export function resolveStoredPhaseRange(
  stored: StoredDanceScheduleFilters,
  phaseCount: number,
): { minPhaseIndex: number; maxPhaseIndex: number } {
  const { min, max } = resolveStoredRange(stored.minPhaseIndex, stored.maxPhaseIndex, phaseCount)
  return { minPhaseIndex: min, maxPhaseIndex: max }
}

export function resolveStoredShowGca(stored: StoredDanceScheduleFilters): boolean {
  return typeof stored.showGca === 'boolean' ? stored.showGca : true
}
