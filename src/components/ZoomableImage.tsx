import { useEffect, useId, type ImgHTMLAttributes } from 'react'
import { useImageGallery } from '../hooks/useImageGallery'
import styles from './ZoomableImage.module.css'

type ZoomableImageProps = ImgHTMLAttributes<HTMLImageElement>

// Reserved `title` tokens a content author can set via standard markdown
// image syntax — `![alt](./assets/photo.jpg "small")` is plain CommonMark,
// no custom syntax — to request a smaller-than-natural display size (e.g. a
// caller headshot looks better as a small tappable thumbnail than at full
// native resolution; the full image is still one tap away via the lightbox
// below). Consumed here as a size directive rather than passed through as a
// literal HTML `title` (browser tooltip) — see parseTitle below for how
// this combines with NO_ZOOM_TOKEN, and what happens to an unrecognized
// title.
const SIZE_CLASSES: Record<string, string | undefined> = {
  thumbnail: styles.thumbnail,
  small: styles.small,
  medium: styles.medium,
  large: styles.large,
}

// A second, independent (combinable) reserved token —
// `![alt](./assets/icon.png "thumbnail no-zoom")` — for a small, decorative
// image (an icon, a badge) that isn't worth the click-to-zoom/lightbox
// treatment: no onClick, no zoom-in cursor, and not registered with the
// page's shared gallery (ImageGallery.tsx) — so it never becomes a stop in
// the lightbox's own next/prev navigation for the OTHER, real photos on the
// page either. A space-separated token, not folded into a single combined
// keyword like "icon" — reuses the existing four size keywords rather than
// inventing a fifth, size-and-behavior-tied one, so an author can pair
// "no-zoom" with whichever size (or none, for an already-small source
// image) actually fits.
const NO_ZOOM_TOKEN = 'no-zoom'

// Splits a title into its recognized directive tokens (size, no-zoom) plus
// whatever's left over. If NEITHER directive is present, the whole original
// title is returned as-is, to be rendered as a literal tooltip —
// unrecognized text (a real caption) must never be silently swallowed. If
// at least one directive IS recognized, the tooltip is dropped entirely
// (matches this component's original single-size-keyword behavior) — a
// title mixing a real caption with a directive isn't supported; use one or
// the other.
function parseTitle(title: string | undefined) {
  if (!title) {
    return { sizeClass: undefined, noZoom: false, tooltip: title }
  }
  const tokens = title.toLowerCase().split(/\s+/)
  const sizeToken = tokens.find((token) => token in SIZE_CLASSES)
  const noZoom = tokens.includes(NO_ZOOM_TOKEN)
  const recognized = sizeToken !== undefined || noZoom
  return {
    sizeClass: sizeToken ? SIZE_CLASSES[sizeToken] : undefined,
    noZoom,
    tooltip: recognized ? undefined : title,
  }
}

export function ZoomableImage({ src, alt = '', title, ...rest }: ZoomableImageProps) {
  const id = useId()
  const { register, unregister, openAt } = useImageGallery()
  const { sizeClass, noZoom, tooltip } = parseTitle(title)

  useEffect(() => {
    if (!src || noZoom) {
      return
    }
    register({ id, src, alt })
    return () => unregister(id)
  }, [id, src, alt, noZoom, register, unregister])

  if (!src) {
    return null
  }

  const baseClass = noZoom ? styles.plain : styles.zoomable
  const className = sizeClass ? `${baseClass} ${sizeClass}` : baseClass

  return (
    <img
      src={src}
      alt={alt}
      {...rest}
      title={tooltip}
      onClick={noZoom ? undefined : () => openAt(id)}
      className={className}
    />
  )
}
