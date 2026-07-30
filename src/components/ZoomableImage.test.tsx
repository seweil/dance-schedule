import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ImageGalleryProvider } from './ImageGallery'
import { ZoomableImage } from './ZoomableImage'
import type { ReactNode } from 'react'

vi.mock('./ZoomableImage.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

function renderWithGallery(children: ReactNode) {
  return render(<ImageGalleryProvider>{children}</ImageGalleryProvider>)
}

describe('ZoomableImage', () => {
  it('renders nothing when src is missing', () => {
    const { container } = renderWithGallery(<ZoomableImage src={undefined} alt="Missing" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders an image with no size class and no title by default', () => {
    renderWithGallery(<ZoomableImage src="./photo.jpg" alt="A photo" />)
    const img = screen.getByRole('img', { name: 'A photo' })
    expect(img.className).toBe('zoomable')
    expect(img).not.toHaveAttribute('title')
  })

  it.each(['thumbnail', 'small', 'medium', 'large'])(
    'applies the %s size class and consumes the title as a size directive, not a literal title',
    (size) => {
      renderWithGallery(<ZoomableImage src="./caller.jpg" alt="A caller" title={size} />)
      const img = screen.getByRole('img', { name: 'A caller' })
      expect(img.className).toBe(`zoomable ${size}`)
      expect(img).not.toHaveAttribute('title')
    },
  )

  it('treats the title case-insensitively', () => {
    renderWithGallery(<ZoomableImage src="./caller.jpg" alt="A caller" title="Thumbnail" />)
    expect(screen.getByRole('img', { name: 'A caller' }).className).toBe('zoomable thumbnail')
  })

  it('leaves a non-size-keyword title as a real tooltip', () => {
    renderWithGallery(<ZoomableImage src="./photo.jpg" alt="A photo" title="A caption, not a size" />)
    const img = screen.getByRole('img', { name: 'A photo' })
    expect(img.className).toBe('zoomable')
    expect(img).toHaveAttribute('title', 'A caption, not a size')
  })

  it('opens the lightbox on click', () => {
    renderWithGallery(<ZoomableImage src="./photo.jpg" alt="A photo" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('img', { name: 'A photo' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('navigates to another image on the page instead of disabling the arrows', () => {
    renderWithGallery(
      <>
        <ZoomableImage src="./one.jpg" alt="First photo" />
        <ZoomableImage src="./two.jpg" alt="Second photo" />
      </>,
    )
    fireEvent.click(screen.getByRole('img', { name: 'First photo' }))
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('button', { name: 'Previous' })).not.toBeDisabled()
  })
})
