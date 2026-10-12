import { describe, expect, it } from 'vitest'
import { isLevelCode, normalizeLevelCode } from './levelCodes'

describe('isLevelCode', () => {
  it.each(['SSD', 'Plus', 'C3B', 'A2', 'Intro', 'Various'])('accepts %s', (code) => {
    expect(isLevelCode(code)).toBe(true)
  })

  it.each(['C5', 'Advanced', 'plus', ''])('rejects %j', (code) => {
    expect(isLevelCode(code)).toBe(false)
  })
})

describe('normalizeLevelCode', () => {
  it('maps the "Advanced" alias to A2', () => {
    expect(normalizeLevelCode('Advanced')).toBe('A2')
  })

  it('leaves everything else unchanged, valid or not', () => {
    expect(normalizeLevelCode('A1')).toBe('A1')
    expect(normalizeLevelCode('C5')).toBe('C5')
  })
})
