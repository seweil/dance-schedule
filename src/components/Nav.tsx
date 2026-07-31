import { NavLink } from 'react-router-dom'
import routes from '~react-pages'
import { buildNavTree } from '../lib/buildNavTree'
import styles from './Nav.module.css'

// The desktop-only flat tab-link bar — always visible at ≥641px, hidden entirely
// below that (see Nav.module.css), where PageMenu.tsx (rendered per-page, sharing
// a row with that page's own title via PageHeader.tsx) is the equivalent
// navigation UI instead. Rendered once, globally, in App.tsx — unlike PageMenu,
// there's nothing page-specific about this component, so one shared instance
// above all page content is the right shape for it.
export function Nav() {
  const items = buildNavTree(routes)

  return (
    <nav aria-label="Site navigation" className={styles.nav}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.href}>
            {/* end (only for Home): every other route's path starts with "/" too, so
                without it NavLink's default prefix-matching would mark Home
                permanently "current" no matter which page is actually active. */}
            <NavLink to={item.href} end={item.href === '/'} className={styles.link}>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
