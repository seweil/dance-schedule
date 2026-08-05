import { useEffect } from 'react'

// Reported live (real iPhone, not the Simulator): right after rotating from
// portrait to landscape, a `position: fixed` element's actual touch-hit-test
// area sat offset from where it visually rendered (same underlying symptom
// as the WebKit `transform`-hit-testing desync this app already found and
// fixed once — see docs/design/text-size-preference.md's "Dropdown show/hide
// drops its transform slide entirely" decision — but a DIFFERENT trigger: no
// animated transform is involved here at all, this is a stale-hit-test-after-
// orientation-change bug in WebKit's own fixed-position compositing, not
// something this app's own CSS causes). Confirmed live that a tiny manual
// scroll immediately fixed it — WebKit resyncs `position: fixed` hit-testing
// on the next scroll, just not proactively right after `orientationchange`
// on its own. This does that same nudge programmatically, so a person never
// has to discover the manual workaround themselves: on `orientationchange`,
// scroll 1px down and immediately back — imperceptible, but enough to force
// the resync. Global (App.tsx), not scoped to any one component, since the
// underlying bug isn't specific to Nav.tsx's own dropdown — any current or
// future `position: fixed` element (ScrollToTopButton.tsx today) benefits
// the same way. Couldn't be verified on real iOS hardware in this session
// (Chrome-only tooling) — confirm on a real device after this ships.
export function useNudgeScrollOnOrientationChange(): void {
  useEffect(() => {
    function nudge() {
      const y = window.scrollY
      window.scrollTo(window.scrollX, y + 1)
      window.scrollTo(window.scrollX, y)
    }

    window.addEventListener('orientationchange', nudge)
    return () => window.removeEventListener('orientationchange', nudge)
  }, [])
}
