import styles from './SkipLink.module.css'

// The first focusable element on every page (rendered first in App.tsx, before
// Nav) — a keyboard/screen-reader user would otherwise have to tab through the
// entire nav (every link, the text-size dropdown, Nav.tsx's scroll buttons on
// desktop) before reaching actual page content on every single navigation.
// Invisible until it receives focus (SkipLink.module.css), so sighted mouse
// users never see it — standard skip-link pattern. Targets "#main-content",
// the <main> landmark App.tsx wraps routed page content in.
export function SkipLink() {
  return (
    <a href="#main-content" className={styles.skipLink}>
      Skip to content
    </a>
  )
}
