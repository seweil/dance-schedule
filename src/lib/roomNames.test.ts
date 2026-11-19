import { describe, expect, it } from 'vitest'
import { formatRoomName } from './roomNames'

describe('formatRoomName', () => {
  it('abbreviates "Conference" to "Conf"', () => {
    expect(formatRoomName('Conference Room 1')).toBe('Conf Room 1')
    expect(formatRoomName('Conference Room 3/4')).toBe('Conf Room 3/4')
  })

  it('leaves other names, and words merely containing the letters, alone', () => {
    expect(formatRoomName('Willamette South (Hall A)')).toBe('Willamette South (Hall A)')
    expect(formatRoomName('Conferences Hall')).toBe('Conferences Hall')
  })
})
