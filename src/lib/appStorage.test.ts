import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearAllStorage, readStorageJson, writeStorageJson } from './appStorage'

// localStorage itself is reset globally after every test (src/test-setup.ts) — this
// only needs to undo the mocks this file adds on top of that.
afterEach(() => {
  vi.restoreAllMocks()
})

describe('readStorageJson', () => {
  it('returns undefined when the key is not set', () => {
    expect(readStorageJson('missing')).toBeUndefined()
  })

  it('round-trips a value written by writeStorageJson', () => {
    writeStorageJson('key', { a: 1, b: 'two' })
    expect(readStorageJson('key')).toEqual({ a: 1, b: 'two' })
  })

  it('returns undefined instead of throwing on malformed JSON', () => {
    localStorage.setItem('key', 'not json{')
    expect(readStorageJson('key')).toBeUndefined()
  })

  it('returns undefined instead of throwing when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStorageJson('key')).toBeUndefined()
  })
})

describe('writeStorageJson', () => {
  it('does not throw when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => writeStorageJson('key', { a: 1 })).not.toThrow()
  })
})

describe('clearAllStorage', () => {
  it('removes everything written to localStorage', () => {
    writeStorageJson('a', 1)
    writeStorageJson('b', 2)
    clearAllStorage()
    expect(localStorage.length).toBe(0)
  })

  it('does not throw when localStorage.clear throws', () => {
    vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => clearAllStorage()).not.toThrow()
  })
})
