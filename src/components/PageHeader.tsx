import type { ReactNode } from 'react'
import { PageMenu } from './PageMenu'
import styles from './PageHeader.module.css'

// Wraps every page's own title so PageMenu.tsx's mobile kebab toggle can share its
// row instead of sitting in its own bar above the page. Only visually matters on
// mobile — at desktop widths PageMenu renders nothing (Nav.tsx's tab bar is the
// visible navigation UI there instead), so this just reads as a plain title.
// `title` is a ReactNode, not a plain string, since a couple of callers
// (RawDanceScheduleDebugPage.tsx) build it from JSX, not literal text.
export function PageHeader({ title }: { title: ReactNode }) {
  return (
    <div className={styles.pageHeader}>
      <h1>{title}</h1>
      <PageMenu />
    </div>
  )
}
