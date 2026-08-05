import type { ReactNode } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { TABLET_MIN_WIDTH_PX } from '../lib/breakpoints'
import { PageMenu } from './PageMenu'
import styles from './PageHeader.module.css'

// Nav.tsx's own full tab bar showing (TABLET_MIN_WIDTH_PX — the JS-side half
// of the shared --tablet-and-up token, see that module's own comment) AND
// landscape orientation (short on vertical space) — NOT phone width, even
// in landscape: PageMenu.tsx's kebab toggle doesn't show anything until
// tapped open, so there's no already-visible "current page" indicator to
// be redundant WITH at that width — hiding the title there would leave no
// visible page identifier at all until the menu's opened. The redundancy
// this exists for is specifically with Nav.tsx's own bold/accent-colored
// current tab, only ever visible at this width.
const WIDE_LANDSCAPE_QUERY = `(orientation: landscape) and (min-width: ${TABLET_MIN_WIDTH_PX}px)`

// Wraps every page's own title so PageMenu.tsx's mobile kebab toggle can share its
// row instead of sitting in its own bar above the page. Only visually matters on
// mobile — at desktop widths PageMenu renders nothing (Nav.tsx's tab bar is the
// visible navigation UI there instead), so this just reads as a plain title.
// `title` is a ReactNode, not a plain string, since a couple of callers
// (RawDanceScheduleDebugPage.tsx) build it from JSX, not literal text.
export function PageHeader({ title }: { title: ReactNode }) {
  // Reported live: in landscape, wide enough for Nav.tsx's full tab bar to
  // show (not PageMenu.tsx's kebab menu), this title both ate into scarce
  // vertical space and duplicated Nav's own already-highlighted current
  // tab. Narrower phone widths were briefly (mistakenly) included too —
  // reverted: PageMenu.tsx's kebab toggle is closed by default and shows no
  // page name of its own, so at that width the title is the ONLY visible
  // page identifier, in every orientation — hiding it there was a
  // regression, not a fix. Existing kebab-toggle-shares-a-row-with-the-
  // title layout at phone width is unchanged. Still rendered (not
  // conditionally omitted) so the page keeps its one semantic <h1>/heading
  // landmark for screen readers even when sighted users don't see it — same
  // "still there, just visually hidden" approach as TextSizeControl.tsx's
  // own showHeading={false} case.
  const isWideLandscape = useMediaQuery(WIDE_LANDSCAPE_QUERY)

  return (
    <div className={styles.pageHeader}>
      <h1 className={isWideLandscape ? styles.visuallyHidden : undefined}>{title}</h1>
      <PageMenu />
    </div>
  )
}
