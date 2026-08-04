import { useEffect, useRef, useState } from 'react'

export interface DismissableMenu<Root extends HTMLElement, Toggle extends HTMLElement> {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  toggle: () => void
  rootRef: React.RefObject<Root | null>
  toggleRef: React.RefObject<Toggle | null>
}

// Shared open/close behavior for a toggle-button-plus-dropdown menu — closes
// on Escape (returning focus to the toggle button) and on a pointerdown
// outside the menu's own root element. Used by PageMenu.tsx's mobile kebab
// dropdown and Nav.tsx's desktop "Text size" dropdown, the two dismissable
// menus in this app; `rootRef` goes on whichever ancestor wraps both the
// toggle and its dropdown (so an outside click anywhere else closes it), and
// `toggleRef` goes on the toggle button itself.
export function useDismissableMenu<
  Root extends HTMLElement,
  Toggle extends HTMLElement,
>(): DismissableMenu<Root, Toggle> {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<Root>(null)
  const toggleRef = useRef<Toggle>(null)

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
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  function toggle() {
    setIsOpen((open) => !open)
  }

  return { isOpen, setIsOpen, toggle, rootRef, toggleRef }
}
