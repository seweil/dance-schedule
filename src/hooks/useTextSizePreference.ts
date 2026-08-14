import { useEffect, useState } from 'react'
import { readStorageJson, writeStorageJson } from '../lib/appStorage'
import { trackEvent } from '../lib/rum'

export type TextSize = 'normal' | 'large' | 'x-large'

const TEXT_SIZES: readonly TextSize[] = ['normal', 'large', 'x-large']

// Unscoped — not namespaced by BASE_URL the way useLastPagePersistence.ts's key is —
// since text size is a property of the person using this device, not of which
// content set/event they happen to be viewing right now; it should stay the same
// across all of them.
const STORAGE_KEY = 'dance-schedule:text-size'

function isTextSize(value: unknown): value is TextSize {
  return typeof value === 'string' && (TEXT_SIZES as readonly string[]).includes(value)
}

function resolveStoredTextSize(): TextSize {
  const stored = readStorageJson<TextSize>(STORAGE_KEY)
  return isTextSize(stored) ? stored : 'normal'
}

export interface UseTextSizePreferenceResult {
  textSize: TextSize
  setTextSize: (textSize: TextSize) => void
}

// Applies the preference site-wide via a `data-text-size` attribute on <html>
// (src/index.css's `:root[data-text-size="..."]` rules do the actual font-size
// scaling) — every font-size in this app is already rem/em, so that one attribute
// is what makes every screen respect the preference, not just whichever page
// happens to render this hook. 'normal' removes the attribute entirely rather than
// setting it to "normal", matching index.css's own convention of no attribute at
// all meaning "today's unchanged default" — see docs/design/text-size-preference.md.
export function useTextSizePreference(): UseTextSizePreferenceResult {
  const [textSize, setTextSize] = useState<TextSize>(() => resolveStoredTextSize())

  useEffect(() => {
    if (textSize === 'normal') {
      delete document.documentElement.dataset.textSize
    } else {
      document.documentElement.dataset.textSize = textSize
    }
    writeStorageJson(STORAGE_KEY, textSize)
    // Deliberately fires on mount too, not just on an explicit change — the
    // useful signal is "what text size are visitors actually using" (most
    // people who set it never touch it again), not "how often was the
    // control clicked."
    trackEvent('text_size_preference', { textSize })
  }, [textSize])

  return { textSize, setTextSize }
}
