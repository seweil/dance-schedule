import { Link } from 'react-router-dom'
import routes from '~react-pages'
import { buildNavTree } from '../lib/buildNavTree'

export function Nav() {
  const items = buildNavTree(routes)

  return (
    <nav aria-label="Site navigation">
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
