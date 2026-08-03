import type { ReactNode } from 'react'
import { TextSizeContext } from '../hooks/useTextSize'
import { useTextSizePreference } from '../hooks/useTextSizePreference'

// Shares one useTextSizePreference() instance across the whole app — this app's
// first Context, needed because Nav.tsx (rendered once, globally, in App.tsx) and
// PageMenu.tsx (rendered fresh inside every single page's own PageHeader — see
// PageHeader.tsx) both need to read/set the same preference and stay in sync with
// each other in real time, but there's no practical way to prop-drill it: PageMenu
// would need the value threaded through every page component that renders
// PageHeader, not just through App.tsx. See docs/design/text-size-preference.md.
export function TextSizeProvider({ children }: { children: ReactNode }) {
  const value = useTextSizePreference()
  return <TextSizeContext.Provider value={value}>{children}</TextSizeContext.Provider>
}
