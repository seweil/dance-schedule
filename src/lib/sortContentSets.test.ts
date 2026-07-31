import { describe, expect, it } from 'vitest'
import { sortContentSets } from './sortContentSets'
import type { ContentSetInfo } from '../types/contentSets'

function set(name: string, displayName: string, testFixture = false): ContentSetInfo {
  return { name, displayName, testFixture }
}

describe('sortContentSets', () => {
  it('returns an empty array unchanged', () => {
    expect(sortContentSets([])).toEqual([])
  })

  it('sorts real events alphabetically by displayName', () => {
    const sets = [set('c', 'Charlie'), set('a', 'Alpha'), set('b', 'Bravo')]
    expect(sortContentSets(sets).map((s) => s.name)).toEqual(['a', 'b', 'c'])
  })

  it('puts every test-fixture set after every real event, regardless of name', () => {
    const sets = [
      set('automated-testing', 'Automated Testing (Zzz to sort first alphabetically)', true),
      set('backtrack2abq', 'Back Track 2 ABQ'),
    ]
    expect(sortContentSets(sets).map((s) => s.name)).toEqual(['backtrack2abq', 'automated-testing'])
  })

  it('sorts test-fixture sets alphabetically among themselves', () => {
    const sets = [set('test', 'Dance Schedule (Test)', true), set('automated-testing', 'Automated Testing', true)]
    expect(sortContentSets(sets).map((s) => s.name)).toEqual(['automated-testing', 'test'])
  })

  it('does not mutate the input array', () => {
    const sets = [set('b', 'Bravo'), set('a', 'Alpha')]
    sortContentSets(sets)
    expect(sets.map((s) => s.name)).toEqual(['b', 'a'])
  })
})
