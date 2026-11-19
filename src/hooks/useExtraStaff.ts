import { useState } from 'react'
import { loadExtraStaff, saveExtraStaff } from '../lib/extraStaffStorage'

export interface UseExtraStaffResult {
  extraStaff: string[]
  setExtraStaff: (names: string[]) => void
}

// The Staff Schedule's "Show more staff" picks (StaffPicker.tsx), read once at
// mount and saved on every change — see extraStaffStorage.ts.
export function useExtraStaff(): UseExtraStaffResult {
  const [extraStaff, setExtraStaffState] = useState(loadExtraStaff)

  function setExtraStaff(names: string[]) {
    setExtraStaffState(names)
    saveExtraStaff(names)
  }

  return { extraStaff, setExtraStaff }
}
