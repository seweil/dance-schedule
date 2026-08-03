import { createContext, useContext } from 'react'
import type { UseTextSizePreferenceResult } from './useTextSizePreference'

export const TextSizeContext = createContext<UseTextSizePreferenceResult | null>(null)

export function useTextSize(): UseTextSizePreferenceResult {
  const context = useContext(TextSizeContext)
  if (!context) {
    throw new Error('useTextSize must be used within a TextSizeProvider')
  }
  return context
}
