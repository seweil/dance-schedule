import { Link } from 'react-router-dom'
import routes from '~react-pages'
import { buildNavTree, type NavItem } from '../lib/buildNavTree'

function NavList({ items }: { items: NavItem[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={item.href ?? item.label}>
          {item.href ? <Link to={item.href}>{item.label}</Link> : <span>{item.label}</span>}
          <NavList items={item.children} />
        </li>
      ))}
    </ul>
  )
}

export function Nav() {
  const items = buildNavTree(routes)

  return (
    <nav aria-label="Site navigation">
      <NavList items={items} />
    </nav>
  )
}
