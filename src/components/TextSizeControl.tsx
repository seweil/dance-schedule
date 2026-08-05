import { useId } from 'react'
import { useTextSize } from '../hooks/useTextSize'
import type { TextSize } from '../hooks/useTextSizePreference'
import styles from './TextSizeControl.module.css'

// previewRem is this option's own "Aa" preview glyph size — deliberately NOT the
// same percentages index.css's [data-text-size] rules apply to the whole page
// (125%/150%): those would make the buttons themselves unwieldy at Extra Large.
// This is a relative preview scaled for legibility inside a small control, not a
// literal rendering of the real page-wide effect.
const OPTIONS: readonly { value: TextSize; label: string; previewRem: number }[] = [
  { value: 'normal', label: 'Normal', previewRem: 1 },
  { value: 'large', label: 'Large', previewRem: 1.2 },
  { value: 'x-large', label: 'Extra Large', previewRem: 1.4 },
]

// Shared by Nav.tsx (desktop tab bar) and PageMenu.tsx (mobile dropdown) — both
// need the same three-way toggle and active-state logic, just inside different
// surrounding layouts, so only the control itself is shared here; each caller
// supplies its own wrapping element/spacing.
//
// Each option pairs its word label ("Normal"/"Large"/"Extra Large") with a
// same-meaning "Aa" glyph rendered at a size proportional to that option — the
// word label is still what makes each option unambiguous (this control exists
// for low-vision users, so it can't rely on someone distinguishing subtly
// different icon sizes ALONE), but the glyph gives an immediate, at-a-glance
// preview of what selecting it will actually look like, rather than making
// someone guess from the word alone. A visible "Text size" heading (not just an
// aria-label) makes the whole group self-explanatory without relying on a
// screen reader to announce what these three buttons are for.
//
// `onSelect`, called after setTextSize on every click, exists for both
// callers' dropdown benefit: unlike a page link (PageMenu.tsx's other menu
// items), selecting a size doesn't navigate anywhere, so nothing else would
// otherwise close the dropdown the way clicking a link does (a different
// route unmounts and remounts PageMenu fresh, closed by construction — see
// that file's own comment). Both Nav.tsx and PageMenu.tsx pass this for the
// same reason — Nav.tsx's own control is always a dropdown now too (no more
// always-visible row).
//
// `showHeading` (default true) exists for Nav.tsx's dropdown specifically:
// its own toggle button already reads "Text size" before this control ever
// opens, so showing the heading there too was a reported-live redundant
// repeat of the same two words. Still rendered when false, just visually
// hidden (see .visuallyHidden's own comment) — `.control`'s `aria-labelledby`
// needs it to exist for the group to have an accessible name at all.
export function TextSizeControl({
  onSelect,
  showHeading = true,
}: { onSelect?: () => void; showHeading?: boolean } = {}) {
  const { textSize, setTextSize } = useTextSize()
  const headingId = useId()

  return (
    <div className={styles.wrapper}>
      <span id={headingId} className={showHeading ? styles.heading : styles.visuallyHidden}>
        Text size
      </span>
      <div className={styles.control} role="group" aria-labelledby={headingId}>
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.button}
            aria-pressed={textSize === option.value}
            onClick={() => {
              setTextSize(option.value)
              onSelect?.()
            }}
          >
            <span className={styles.preview} style={{ fontSize: `${option.previewRem}rem` }} aria-hidden="true">
              Aa
            </span>
            <span className={styles.label}>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
