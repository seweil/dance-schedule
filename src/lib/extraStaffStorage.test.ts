import { describe, expect, it } from 'vitest'
import { loadExtraStaff, saveExtraStaff } from './extraStaffStorage'

// localStorage itself is reset globally after every test — see src/test-setup.ts.

describe('extraStaffStorage', () => {
  it('reads as nobody picked when nothing is stored', () => {
    expect(loadExtraStaff()).toEqual([])
  })

  it('round-trips the picked names', () => {
    saveExtraStaff(['Randy Dibble', 'Julie Stiers'])
    expect(loadExtraStaff()).toEqual(['Randy Dibble', 'Julie Stiers'])
  })

  it('ignores a malformed stored value', () => {
    localStorage.setItem('dance-schedule:extra-staff', JSON.stringify({ not: 'a list' }))
    expect(loadExtraStaff()).toEqual([])
    localStorage.setItem('dance-schedule:extra-staff', JSON.stringify(['Randy Dibble', 42]))
    expect(loadExtraStaff()).toEqual(['Randy Dibble'])
  })
})
