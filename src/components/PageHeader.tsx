import type { ReactNode } from 'react'
import { PageMenu } from './PageMenu'
import styles from './PageHeader.module.css'

// Wraps every page's own title so PageMenu.tsx's mobile kebab toggle can share its
// row instead of sitting in its own bar above the page. Only visually matters on
// mobile — at desktop widths PageMenu renders nothing (Nav.tsx's tab bar is the
// visible navigation UI there instead), so this just reads as a plain title.
// `title` is a ReactNode, not a plain string, since a couple of callers
// (RawDanceScheduleDebugPage.tsx) build it from JSX, not literal text.
//
// Always shown, at every width and orientation — an earlier version visually
// hid the title whenever Nav.tsx's full tab bar showed in landscape
// (`orientation: landscape` at tablet-and-up width), reasoning it duplicated
// Nav's own already-highlighted current tab. Removed, per direct product
// decision: that condition doesn't actually distinguish "a landscape phone/
// tablet" from "an ordinary desktop browser window" — nearly every desktop
// window IS landscape-shaped, so it was unintentionally hiding the title on
// virtually every desktop visit, not just the narrow case it was written
// for (reported live as "title hidden above 950px" — just wherever a given
// window happened to already be wider than tall). See
// docs/design/responsive-breakpoints.md's "Follow-up audit and three bug
// fixes" for the full history.
export function PageHeader({ title }: { title: ReactNode }) {
  return (
    <div className={styles.pageHeader}>
      <h1>{title}</h1>
      <PageMenu />
    </div>
  )
}
