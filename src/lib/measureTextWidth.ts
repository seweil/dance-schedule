let sharedContext: CanvasRenderingContext2D | null | undefined

function getSharedContext(): CanvasRenderingContext2D | null {
  if (sharedContext === undefined) {
    sharedContext = document.createElement('canvas').getContext('2d')
  }
  return sharedContext
}

// Falls back to a rough average-character-width estimate when a real 2D canvas
// context isn't available — confirmed live that this project's jsdom test
// environment returns null from getContext('2d') (the optional `canvas` npm package
// isn't installed), so this path runs during every unit test that renders a session
// card. An approximation is safer than always returning 0, which would make
// shouldCombinePrimaryAndDetails() think everything always fits.
const FALLBACK_AVG_CHAR_WIDTH_PX = 7

export function measureTextWidth(text: string, font: string): number {
  const context = getSharedContext()
  if (!context) {
    return text.length * FALLBACK_AVG_CHAR_WIDTH_PX
  }
  context.font = font
  return context.measureText(text).width
}
