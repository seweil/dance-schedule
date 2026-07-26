import { useEffect, useState } from 'react'

// Selector-based rather than a ref, since the only caller (ScrollToTopButton,
// watching the page's one <nav> landmark) has nothing to attach a ref to itself —
// stays this simple until a second caller actually needs something more specific.
export function useIsElementVisible(selector: string): boolean {
  // Assume visible until the observer reports otherwise — correct for the common
  // case (freshly loaded at the top of the page) and avoids a flash of "hidden"
  // before the first observer callback fires.
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const element = document.querySelector(selector)
    if (!element) {
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry?.isIntersecting ?? true)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [selector])

  return isVisible
}
