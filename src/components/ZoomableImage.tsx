import { useState, type ImgHTMLAttributes } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'

type ZoomableImageProps = ImgHTMLAttributes<HTMLImageElement>

export function ZoomableImage({ src, alt = '', ...rest }: ZoomableImageProps) {
  const [open, setOpen] = useState(false)

  if (!src) {
    return null
  }

  return (
    <>
      <img
        src={src}
        alt={alt}
        {...rest}
        onClick={() => setOpen(true)}
        style={{ cursor: 'zoom-in' }}
      />
      <Lightbox open={open} close={() => setOpen(false)} slides={[{ src, alt }]} />
    </>
  )
}
