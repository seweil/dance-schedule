import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateContentSetIcons } from './content-icons'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-icons-test-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

async function writeSourceIcon(root: string, contentDir: string, size: number) {
  const dir = path.join(root, contentDir)
  fs.mkdirSync(dir, { recursive: true })
  await sharp({ create: { width: size, height: size, channels: 4, background: '#123456' } })
    .png()
    .toFile(path.join(dir, 'icon.png'))
}

describe('generateContentSetIcons', () => {
  it('generates icon-192, icon-512, and icon-maskable-512 from a real source icon', async () => {
    await writeSourceIcon(root, 'content/real', 1024)
    const outDir = path.join(root, 'out')

    await generateContentSetIcons(root, 'content/real', 'real', outDir)

    const small = await sharp(path.join(outDir, 'icon-192.png')).metadata()
    expect(small.width).toBe(192)
    expect(small.height).toBe(192)

    const large = await sharp(path.join(outDir, 'icon-512.png')).metadata()
    expect(large.width).toBe(512)
    expect(large.height).toBe(512)

    const maskable = await sharp(path.join(outDir, 'icon-maskable-512.png')).metadata()
    expect(maskable.width).toBe(512)
    expect(maskable.height).toBe(512)
  })

  it('generates a placeholder icon set when content/<set>/icon.png is absent', async () => {
    fs.mkdirSync(path.join(root, 'content/test'), { recursive: true })
    const outDir = path.join(root, 'out')

    await generateContentSetIcons(root, 'content/test', 'test', outDir)

    const small = await sharp(path.join(outDir, 'icon-192.png')).metadata()
    expect(small.width).toBe(192)
    expect(small.height).toBe(192)
  })

  it('throws when the source icon is smaller than 512x512', async () => {
    await writeSourceIcon(root, 'content/real', 256)
    const outDir = path.join(root, 'out')

    await expect(generateContentSetIcons(root, 'content/real', 'real', outDir)).rejects.toThrow(
      /must be at least 512x512/,
    )
  })
})
