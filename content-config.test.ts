import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertContentSetExists, listContentSets, loadTopLevelContentConfig } from './content-config'

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

describe('loadTopLevelContentConfig', () => {
  it('defaults to "real" when content/config.yaml is missing', () => {
    makeContentSetDir(root, 'real')
    expect(loadTopLevelContentConfig(root)).toEqual({ defaultContentSet: 'real' })
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
