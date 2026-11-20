import { useCallback, useState, type ReactNode } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import { ImageGalleryContext, type GalleryImage } from '../hooks/useImageGallery'
import { useLightboxGuards } from '../hooks/useLightboxGuards'
import styles from './ImageGallery.module.css'

// Lets a page's ZoomableImage instances share one Lightbox, so its prev/next
// arrows step through every image on the current page instead of each image
// owning an isolated, single-slide lightbox (where the arrows had nothing to
// navigate to and were permanently disabled). Images register themselves on
// mount/unmount, in document order, so the list naturally reflects only
// whichever page's content is currently rendered — no route-change bookkeeping
// needed here.
export function ImageGalleryProvider({ children }: { children: ReactNode }) {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [openId, setOpenId] = useState<string | null>(null)

  const register = useCallback((image: GalleryImage) => {
    setImages((prev) => [...prev, image])
  }, [])

  const unregister = useCallback((id: string) => {
    setImages((prev) => prev.filter((image) => image.id !== id))
  }, [])

  const openAt = useCallback((id: string) => {
    setOpenId(id)
  }, [])

  const close = useCallback(() => setOpenId(null), [])

  const index = images.findIndex((image) => image.id === openId)
  useLightboxGuards(index !== -1, close)

  return (
    <ImageGalleryContext.Provider value={{ register, unregister, openAt }}>
      {children}
      <Lightbox
        open={index !== -1}
        index={Math.max(index, 0)}
        close={close}
        slides={images.map(({ src, alt }) => ({ src, alt }))}
        // Pinch, double-tap and scroll-wheel zoom, plus zoom buttons, for every
        // image — a venue map is the motivating case. maxZoomPixelRatio is how far
        // zoom may go in image pixels per CSS pixel: the default, 1, stops at the
        // image's own resolution (measured: ~3.6x for MidWinter2027's 1275px map
        // on a phone); 2 allows ~7x, enough to read a map's small print, without
        // the heavily upscaled blur a larger value reaches (4 allowed ~14x).
        plugins={[Zoom]}
        zoom={{ maxZoomPixelRatio: 2, scrollToZoom: true }}
        // More ways out than the close button alone (reported live: stuck in the
        // viewer on a phone with no visible close button). A swipe up or down, or a
        // tap on the dark backdrop around the image, closes it too. The swipes only
        // apply when not zoomed in, since a drag then pans; the close button is
        // still visible then (ImageGallery.module.css).
        controller={{ closeOnPullDown: true, closeOnPullUp: true, closeOnBackdropClick: true }}
        className={styles.lightbox}
      />
    </ImageGalleryContext.Provider>
  )
}
