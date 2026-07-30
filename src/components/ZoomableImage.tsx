import { useEffect, useId, type ImgHTMLAttributes } from 'react'
import { useImageGallery } from '../hooks/useImageGallery'
import styles from './ZoomableImage.module.css'

type ZoomableImageProps = ImgHTMLAttributes<HTMLImageElement>

// Reserved `title` values a content author can set via standard markdown
// image syntax — `![alt](./assets/photo.jpg "small")` is plain CommonMark,
// no custom syntax — to request a smaller-than-natural display size (e.g. a
// caller headshot looks better as a small tappable thumbnail than at full
// native resolution; the full image is still one tap away via the lightbox
// below). Consumed here as a size directive rather than passed through as a
// literal HTML `title` (browser tooltip); any other title value is left
// alone and rendered as a real tooltip.
const SIZE_CLASSES: Record<string, string | undefined> = {
  thumbnail: styles.thumbnail,
  small: styles.small,
  medium: styles.medium,
  large: styles.large,
}

export function ZoomableImage({ src, alt = '', title, ...rest }: ZoomableImageProps) {
  const id = useId()
  const { register, unregister, openAt } = useImageGallery()

  useEffect(() => {
    if (!src) {
      return
    }
    register({ id, src, alt })
    return () => unregister(id)
  }, [id, src, alt, register, unregister])

  if (!src) {
    return null
  }

  const sizeClass = title ? SIZE_CLASSES[title.toLowerCase()] : undefined
  const className = sizeClass ? `${styles.zoomable} ${sizeClass}` : styles.zoomable

  return (
    <img
      src={src}
      alt={alt}
      {...rest}
      title={sizeClass ? undefined : title}
      onClick={() => openAt(id)}
      className={className}
    />
  )
}
