import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ZoomableImage } from './ZoomableImage'

vi.mock('./ZoomableImage.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

describe('ZoomableImage', () => {
  it('renders nothing when src is missing', () => {
    const { container } = render(<ZoomableImage src={undefined} alt="Missing" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders an image with no size class and no title by default', () => {
    render(<ZoomableImage src="./photo.jpg" alt="A photo" />)
    const img = screen.getByRole('img', { name: 'A photo' })
    expect(img.className).toBe('zoomable')
    expect(img).not.toHaveAttribute('title')
  })

  it.each(['thumbnail', 'small', 'medium', 'large'])(
    'applies the %s size class and consumes the title as a size directive, not a literal title',
    (size) => {
      render(<ZoomableImage src="./caller.jpg" alt="A caller" title={size} />)
      const img = screen.getByRole('img', { name: 'A caller' })
      expect(img.className).toBe(`zoomable ${size}`)
      expect(img).not.toHaveAttribute('title')
    },
  )

  it('treats the title case-insensitively', () => {
    render(<ZoomableImage src="./caller.jpg" alt="A caller" title="Thumbnail" />)
    expect(screen.getByRole('img', { name: 'A caller' }).className).toBe('zoomable thumbnail')
  })

  it('leaves a non-size-keyword title as a real tooltip', () => {
    render(<ZoomableImage src="./photo.jpg" alt="A photo" title="A caption, not a size" />)
    const img = screen.getByRole('img', { name: 'A photo' })
    expect(img.className).toBe('zoomable')
    expect(img).toHaveAttribute('title', 'A caption, not a size')
  })

  it('opens the lightbox on click', () => {
    render(<ZoomableImage src="./photo.jpg" alt="A photo" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('img', { name: 'A photo' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
