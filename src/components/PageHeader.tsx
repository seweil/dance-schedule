import type { ReactNode } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { PageMenu } from './PageMenu'
import styles from './PageHeader.module.css'

// Matches PageMenu.module.css's/Nav.module.css's own 640px breakpoint — "phone"
// width, not just any landscape window (a landscape tablet/iPad or desktop
// monitor has plenty of vertical room and its own already-visible selected tab
// looks nothing like a redundant duplicate the way a phone's does — see below).
const PHONE_LANDSCAPE_QUERY = '(orientation: landscape) and (max-width: 640px)'

// Wraps every page's own title so PageMenu.tsx's mobile kebab toggle can share its
// row instead of sitting in its own bar above the page. Only visually matters on
// mobile — at desktop widths PageMenu renders nothing (Nav.tsx's tab bar is the
// visible navigation UI there instead), so this just reads as a plain title.
// `title` is a ReactNode, not a plain string, since a couple of callers
// (RawDanceScheduleDebugPage.tsx) build it from JSX, not literal text.
export function PageHeader({ title }: { title: ReactNode }) {
  // Reported live: on a landscape phone, this title duplicated the page's own
  // NavLink tab or PageMenu.tsx's own already-visible selected item, while also
  // eating into the same scarce vertical space the Text-size control was
  // reported as costing (see docs/design/text-size-preference.md's landscape
  // decisions) — worse on a title that wraps to 2-3 lines. Still rendered (not
  // conditionally omitted) so the page keeps its one semantic <h1>/heading
  // landmark for screen readers even when sighted users don't see it — same
  // "still there, just visually hidden" approach as TextSizeControl.tsx's own
  // showHeading={false} case.
  const isPhoneLandscape = useMediaQuery(PHONE_LANDSCAPE_QUERY)

  return (
    <div className={styles.pageHeader}>
      <h1 className={isPhoneLandscape ? styles.visuallyHidden : undefined}>{title}</h1>
      <PageMenu />
    </div>
  )
}
