import { useEffect } from 'react'

// Two guards for the image lightbox (ImageGallery.tsx) while it's open, after a
// real report from the installed iPhone app: stuck in the viewer with no close
// button, still able to swipe between images, and only killing the app got out.
// That points to iOS zooming the whole app screen rather than the lightbox (its
// own zoom pans on a drag instead of changing images), which leaves the close
// button off-screen, with no browser controls to reset the zoom.
//
// - iOS's own pinch-zoom of the page runs through its non-standard `gesture*`
//   events, so cancelling them stops the page zooming. The lightbox's zoom is
//   unaffected: it's built on pointer events.
// - The lightbox closes when the app goes to the background, so switching away
//   and back always gets out, whatever else went wrong.
export function useLightboxGuards(isOpen: boolean, close: () => void) {
  useEffect(() => {
    if (!isOpen) {
      return
    }

    function preventPageZoom(event: Event) {
      event.preventDefault()
    }
    function closeWhenHidden() {
      if (document.visibilityState === 'hidden') {
        close()
      }
    }

    const gestureEvents = ['gesturestart', 'gesturechange', 'gestureend']
    for (const type of gestureEvents) {
      document.addEventListener(type, preventPageZoom, { passive: false })
    }
    document.addEventListener('visibilitychange', closeWhenHidden)
    return () => {
      for (const type of gestureEvents) {
        document.removeEventListener(type, preventPageZoom)
      }
      document.removeEventListener('visibilitychange', closeWhenHidden)
    }
  }, [isOpen, close])
}
