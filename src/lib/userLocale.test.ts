import { afterEach, describe, expect, it } from 'vitest'
import { getUserLocales } from './userLocale'

afterEach(() => {
  Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true })
})

describe('getUserLocales', () => {
  it("lists the browser's own preferred locales before the en-US fallback", () => {
    Object.defineProperty(navigator, 'languages', { value: ['fr-FR', 'fr'], configurable: true })

    expect(getUserLocales()).toEqual(['fr-FR', 'fr', 'en-US'])
  })
})
