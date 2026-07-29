import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SOURCE_ICON_FILENAME = 'icon.png'
const MIN_SOURCE_SIZE = 512
// Icon content occupies this fraction of the maskable canvas, centered — standard
// PWA maskable safe-zone guidance (roughly the inscribed circle OS icon masks crop
// to), so masked shapes (circle, squircle, rounded square) don't clip the artwork.
const MASKABLE_SAFE_ZONE_RATIO = 0.7
// Matches public manifest's shared background_color (see vite.config.ts) — a
// maskable icon should have an opaque background, not transparency, since the OS
// mask reveals whatever's behind transparent areas.
const MASKABLE_BACKGROUND = '#ffffff'
const PLACEHOLDER_BACKGROUND = '#0f172a'
const PLACEHOLDER_FOREGROUND = '#ffffff'
const PLACEHOLDER_SOURCE_SIZE = 1024

// No real artwork exists for any content set yet — generates a simple solid-color
// square with the set's initial letter as a stand-in, via the same downstream
// resize/maskable pipeline a real content/<set>/icon.png would go through. Swapping
// in real art later requires no pipeline changes — see docs/design/content-config.md.
function placeholderIconSvg(contentSet: string): string {
  const initial = (contentSet.charAt(0) || '?').toUpperCase()
  const size = PLACEHOLDER_SOURCE_SIZE
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="${PLACEHOLDER_BACKGROUND}" />
    <text x="50%" y="50%" font-size="${size * 0.47}" font-family="sans-serif" fill="${PLACEHOLDER_FOREGROUND}" text-anchor="middle" dominant-baseline="central">${initial}</text>
  </svg>`
}

async function loadSourceIcon(root: string, contentDir: string, contentSet: string): Promise<Buffer> {
  const iconFile = path.resolve(root, contentDir, SOURCE_ICON_FILENAME)
  if (fs.existsSync(iconFile)) {
    const metadata = await sharp(iconFile).metadata()
    const { width = 0, height = 0 } = metadata
    if (width < MIN_SOURCE_SIZE || height < MIN_SOURCE_SIZE) {
      throw new Error(
        `${iconFile} must be at least ${MIN_SOURCE_SIZE}x${MIN_SOURCE_SIZE} (got ${width}x${height}) — upsampling a smaller source would produce a blurry icon`,
      )
    }
    return fs.readFileSync(iconFile)
  }
  return sharp(Buffer.from(placeholderIconSvg(contentSet))).png().toBuffer()
}

// Generates the manifest icon set (see docs/design/content-config.md) into outDir:
// icon-192.png / icon-512.png ("any" purpose) and icon-maskable-512.png ("maskable"
// purpose, safe-zone padded) — all derived from a single source image, either
// content/<contentDir>/icon.png or, if absent, a generated placeholder.
export async function generateContentSetIcons(
  root: string,
  contentDir: string,
  contentSet: string,
  outDir: string,
): Promise<void> {
  const source = await loadSourceIcon(root, contentDir, contentSet)
  fs.mkdirSync(outDir, { recursive: true })

  await sharp(source).resize(192, 192).png().toFile(path.join(outDir, 'icon-192.png'))
  await sharp(source).resize(512, 512).png().toFile(path.join(outDir, 'icon-512.png'))

  const maskableContentSize = Math.round(512 * MASKABLE_SAFE_ZONE_RATIO)
  const resizedForMaskable = await sharp(source).resize(maskableContentSize, maskableContentSize).png().toBuffer()
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: MASKABLE_BACKGROUND },
  })
    .composite([{ input: resizedForMaskable, gravity: 'center' }])
    .png()
    .toFile(path.join(outDir, 'icon-maskable-512.png'))
}
