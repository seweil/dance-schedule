import { Link } from 'react-router-dom'
import routes from '~react-pages'
import { buildNavTree } from '../lib/buildNavTree'
import styles from './Nav.module.css'

export function Nav() {
  const items = buildNavTree(routes)

  return (
    <nav aria-label="Site navigation" className={styles.nav}>
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link to={item.href}>{item.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
