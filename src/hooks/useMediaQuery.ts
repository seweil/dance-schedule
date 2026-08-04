import { useEffect, useState } from 'react'

// The initial value is read synchronously from matchMedia (same reasoning as
// useOnlineStatus.ts's navigator.onLine) — the browser already knows this at
// mount, so there's no flash of the wrong value to correct. Reacts live to
// viewport/orientation changes (e.g. rotating a phone) via the MediaQueryList's
// own 'change' event, not just a one-off check at some later read time.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query)

    function handleChange() {
      setMatches(mediaQueryList.matches)
    }

    handleChange()
    mediaQueryList.addEventListener('change', handleChange)
    return () => mediaQueryList.removeEventListener('change', handleChange)
  }, [query])

  return matches
}
