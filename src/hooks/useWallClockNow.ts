import { useEffect, useState } from 'react'
import { toWallClockUtc } from '../lib/computeNowLinePosition'

const MINUTE_MS = 60_000

// The current time in the schedule's wall-clock encoding (see toWallClockUtc),
// refreshed on every minute boundary. Also refreshed when the page becomes visible
// again — browsers throttle or suspend timers in a backgrounded tab/installed PWA,
// so without this the value could be many minutes stale on return.
export function useWallClockNow(): Date {
  const [now, setNow] = useState(() => toWallClockUtc(new Date()))

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    function tick() {
      setNow(toWallClockUtc(new Date()))
      // Re-aligned to the next :00 every time rather than a fixed setInterval, so
      // timer drift never accumulates past a minute boundary.
      timeoutId = setTimeout(tick, MINUTE_MS - (Date.now() % MINUTE_MS))
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        clearTimeout(timeoutId)
        tick()
      }
    }

    timeoutId = setTimeout(tick, MINUTE_MS - (Date.now() % MINUTE_MS))
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return now
}
