import { describe, expect, it } from 'vitest'
import { formatDisplayDate } from './formatDisplayDate'

describe('formatDisplayDate', () => {
  it('formats a date in medium style', () => {
    expect(formatDisplayDate(new Date(2026, 6, 22))).toBe('Jul 22, 2026')
  })
})
