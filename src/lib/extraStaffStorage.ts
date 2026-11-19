import { readStorageJson, writeStorageJson } from './appStorage'

const STORAGE_KEY = 'dance-schedule:extra-staff'

// The non-featured callers and cuers a viewer has added to the Staff Schedule
// (StaffPicker.tsx), remembered per device like the dance-schedule filters. Kept
// across days: a name not on the selected day simply gets no column that day.
// Anything malformed in storage reads as "nobody picked."
export function loadExtraStaff(): string[] {
  const stored = readStorageJson<unknown>(STORAGE_KEY)
  return Array.isArray(stored) ? stored.filter((name): name is string => typeof name === 'string') : []
}

export function saveExtraStaff(names: readonly string[]): void {
  writeStorageJson(STORAGE_KEY, names)
}
