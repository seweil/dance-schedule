import { useEffect, useRef, useState } from 'react'

export interface DismissableMenu<
  Root extends HTMLElement,
  Toggle extends HTMLElement,
  Portal extends HTMLElement,
> {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  toggle: () => void
  rootRef: React.RefObject<Root | null>
  toggleRef: React.RefObject<Toggle | null>
  portalRef: React.RefObject<Portal | null>
}

// Shared open/close behavior for a toggle-button-plus-dropdown menu — closes
// on Escape (returning focus to the toggle button) and on a pointerdown
// outside the menu's own root element. Used by PageMenu.tsx's mobile kebab
// dropdown and Nav.tsx's desktop "Text size" dropdown, the two dismissable
// menus in this app; `rootRef` goes on whichever ancestor wraps both the
// toggle and its dropdown (so an outside click anywhere else closes it), and
// `toggleRef` goes on the toggle button itself.
//
// `portalRef` is for a dropdown rendered via `createPortal` somewhere OTHER
// than inside `rootRef`'s own DOM subtree (Nav.tsx's "Text size" dropdown
// needs this — its toggle lives inside a horizontally-scrollable list whose
// `overflow-y: hidden` would otherwise clip the dropdown, so the dropdown
// itself is portaled to `document.body` instead). `rootRef.contains(...)`
// alone would then see a click inside that portaled content as "outside"
// (it's not a DOM descendant of rootRef, even though it's the menu's own
// dropdown) and immediately close it — checking both refs fixes that.
// PageMenu.tsx's dropdown isn't portaled, so it simply never attaches this
// ref, leaving it permanently null; `?.contains` on a null ref is a no-op.
export function useDismissableMenu<
  Root extends HTMLElement,
  Toggle extends HTMLElement,
  Portal extends HTMLElement = HTMLElement,
>(): DismissableMenu<Root, Toggle, Portal> {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<Root>(null)
  const toggleRef = useRef<Toggle>(null)
  const portalRef = useRef<Portal>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        toggleRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || portalRef.current?.contains(target)) {
        return
      }
      setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  function toggle() {
    setIsOpen((open) => !open)
  }

  return { isOpen, setIsOpen, toggle, rootRef, toggleRef, portalRef }
}
