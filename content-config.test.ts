import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertContentSetExists,
  isTestFixtureContentSet,
  listContentSets,
  loadContentManifestStrings,
  loadTopLevelContentConfig,
} from './content-config'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-config-test-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

function writeTopLevelConfig(root: string, contents: string) {
  fs.mkdirSync(path.join(root, 'content'), { recursive: true })
  fs.writeFileSync(path.join(root, 'content/config.yaml'), contents)
}

function makeContentSetDir(root: string, name: string) {
  fs.mkdirSync(path.join(root, 'content', name), { recursive: true })
}

function writeContentSetConfig(root: string, name: string, contents: string) {
  makeContentSetDir(root, name)
  fs.writeFileSync(path.join(root, 'content', name, 'config.yaml'), contents)
}

describe('loadTopLevelContentConfig', () => {
  it('defaults to "automated-testing" when content/config.yaml is missing', () => {
    makeContentSetDir(root, 'automated-testing')
    expect(loadTopLevelContentConfig(root)).toEqual({ defaultContentSet: 'automated-testing' })
  })

  it('reads defaultContentSet from a real config file', () => {
    makeContentSetDir(root, 'spring-2027')
    writeTopLevelConfig(root, 'defaultContentSet: spring-2027\n')
    expect(loadTopLevelContentConfig(root)).toEqual({ defaultContentSet: 'spring-2027' })
  })

  it('throws on malformed YAML', () => {
    writeTopLevelConfig(root, 'defaultContentSet: [unterminated\n')
    expect(() => loadTopLevelContentConfig(root)).toThrow(/Failed to parse content\/config\.yaml/)
  })

  it('throws when defaultContentSet is missing or not a string', () => {
    writeTopLevelConfig(root, 'somethingElse: true\n')
    expect(() => loadTopLevelContentConfig(root)).toThrow(/"defaultContentSet" must be a string/)
  })

  it('throws when defaultContentSet names a content set directory that doesn\'t exist', () => {
    writeTopLevelConfig(root, 'defaultContentSet: nonexistent\n')
    expect(() => loadTopLevelContentConfig(root)).toThrow(/nonexistent.*doesn't exist/)
  })
})

describe('assertContentSetExists', () => {
  it('does not throw when the content set directory exists', () => {
    makeContentSetDir(root, 'real')
    expect(() => assertContentSetExists(root, 'real', 'CONTENT_SET env var')).not.toThrow()
  })

  it('throws a named error when the content set directory does not exist', () => {
    expect(() => assertContentSetExists(root, 'missing', 'CONTENT_SET env var')).toThrow(
      /CONTENT_SET env var names content set "missing", but .* doesn't exist/,
    )
  })

  it('throws when the name resolves to a file, not a directory', () => {
    fs.mkdirSync(path.join(root, 'content'), { recursive: true })
    fs.writeFileSync(path.join(root, 'content/not-a-dir'), '')
    expect(() => assertContentSetExists(root, 'not-a-dir', 'source')).toThrow()
  })
})

describe('listContentSets', () => {
  it('returns an empty array when content/ does not exist', () => {
    expect(listContentSets(root)).toEqual([])
  })

  it('returns sorted set names, ignoring non-directory entries', () => {
    makeContentSetDir(root, 'test')
    makeContentSetDir(root, 'real')
    writeTopLevelConfig(root, 'defaultContentSet: real\n')
    expect(listContentSets(root)).toEqual(['real', 'test'])
  })
})

describe('loadContentManifestStrings', () => {
  it('defaults to "Dance Schedule" when content/<set>/config.yaml is missing', () => {
    makeContentSetDir(root, 'real')
    expect(loadContentManifestStrings(root, 'content/real')).toEqual({
      name: 'Dance Schedule',
      shortName: 'Dance Schedule',
    })
  })

  it('defaults to "Dance Schedule" when config.yaml has no manifest section', () => {
    writeContentSetConfig(root, 'real', 'features:\n  combineA1A2: false\n')
    expect(loadContentManifestStrings(root, 'content/real')).toEqual({
      name: 'Dance Schedule',
      shortName: 'Dance Schedule',
    })
  })

  it('reads an explicit manifest.name/manifest.shortName override', () => {
    writeContentSetConfig(root, 'test', 'manifest:\n  name: Dance Schedule (Test)\n  shortName: DS Test\n')
    expect(loadContentManifestStrings(root, 'content/test')).toEqual({
      name: 'Dance Schedule (Test)',
      shortName: 'DS Test',
    })
  })

  it('throws on malformed YAML', () => {
    writeContentSetConfig(root, 'real', 'manifest: [unterminated\n')
    expect(() => loadContentManifestStrings(root, 'content/real')).toThrow(/Failed to parse/)
  })

  it('throws when manifest.name is present but not a string', () => {
    writeContentSetConfig(root, 'real', 'manifest:\n  name: 42\n')
    expect(() => loadContentManifestStrings(root, 'content/real')).toThrow(/"manifest\.name" must be a string/)
  })

  it('throws when manifest.shortName is present but not a string', () => {
    writeContentSetConfig(root, 'real', 'manifest:\n  shortName: 42\n')
    expect(() => loadContentManifestStrings(root, 'content/real')).toThrow(/"manifest\.shortName" must be a string/)
  })
})

describe('isTestFixtureContentSet', () => {
  it('defaults to false when content/<set>/config.yaml is missing', () => {
    makeContentSetDir(root, 'real')
    expect(isTestFixtureContentSet(root, 'content/real')).toBe(false)
  })

  it('defaults to false when config.yaml has no testFixture key', () => {
    writeContentSetConfig(root, 'real', 'features:\n  combineA1A2: false\n')
    expect(isTestFixtureContentSet(root, 'content/real')).toBe(false)
  })

  it('reads an explicit testFixture: true', () => {
    writeContentSetConfig(root, 'test', 'testFixture: true\n')
    expect(isTestFixtureContentSet(root, 'content/test')).toBe(true)
  })

  it('reads an explicit testFixture: false', () => {
    writeContentSetConfig(root, 'real', 'testFixture: false\n')
    expect(isTestFixtureContentSet(root, 'content/real')).toBe(false)
  })

  it('throws on malformed YAML', () => {
    writeContentSetConfig(root, 'real', 'testFixture: [unterminated\n')
    expect(() => isTestFixtureContentSet(root, 'content/real')).toThrow(/Failed to parse/)
  })

  it('throws when testFixture is present but not a boolean', () => {
    writeContentSetConfig(root, 'real', 'testFixture: yes-please\n')
    expect(() => isTestFixtureContentSet(root, 'content/real')).toThrow(/"testFixture" must be a boolean/)
  })
})
