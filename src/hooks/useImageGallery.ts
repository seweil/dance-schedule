import { createContext, useContext } from 'react'

export type GalleryImage = { id: string; src: string; alt: string }

export type ImageGalleryContextValue = {
  register: (image: GalleryImage) => void
  unregister: (id: string) => void
  openAt: (id: string) => void
}

export const ImageGalleryContext = createContext<ImageGalleryContextValue | null>(null)

export function useImageGallery() {
  const context = useContext(ImageGalleryContext)
  if (!context) {
    throw new Error('useImageGallery must be used within an ImageGalleryProvider')
  }
  return context
}
