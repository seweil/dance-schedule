import { useCallback, useState, type ReactNode } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { ImageGalleryContext, type GalleryImage } from '../hooks/useImageGallery'

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

  const index = images.findIndex((image) => image.id === openId)

  return (
    <ImageGalleryContext.Provider value={{ register, unregister, openAt }}>
      {children}
      <Lightbox
        open={index !== -1}
        index={Math.max(index, 0)}
        close={() => setOpenId(null)}
        slides={images.map(({ src, alt }) => ({ src, alt }))}
      />
    </ImageGalleryContext.Provider>
  )
}
