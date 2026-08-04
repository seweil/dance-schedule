import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TextSizeControl } from './TextSizeControl'
import { TextSizeProvider } from './TextSizeProvider'

function renderControl(props: Parameters<typeof TextSizeControl>[0] = {}) {
  return render(
    <TextSizeProvider>
      <TextSizeControl {...props} />
    </TextSizeProvider>,
  )
}

describe('TextSizeControl', () => {
  it('shows a visible "Text size" heading by default', () => {
    renderControl()
    expect(screen.getByText('Text size')).toBeVisible()
  })

  it('gives the button group an accessible name of "Text size" even when the heading is visually hidden', () => {
    // toBeVisible() doesn't catch the clip-based visually-hidden technique
    // (by design — same pattern already used elsewhere in this app, e.g.
    // DanceScheduleFilters.module.css's own .visuallyHidden), so this checks
    // the class swap directly instead of asserting visibility.
    renderControl({ showHeading: false })
    const heading = screen.getByText('Text size')
    expect(heading.className).toMatch(/visuallyHidden/)
    expect(screen.getByRole('group', { name: 'Text size' })).toBeInTheDocument()
  })

  it('still calls onSelect after choosing a size when the heading is hidden', async () => {
    let selected = false
    renderControl({ showHeading: false, onSelect: () => (selected = true) })
    screen.getByRole('button', { name: 'Large' }).click()
    expect(selected).toBe(true)
  })
})
