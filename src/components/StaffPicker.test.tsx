import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StaffPickerPanel, StaffPickerToggle } from './StaffPicker'
import { useDismissableMenu } from '../hooks/useDismissableMenu'

vi.mock('./StaffPicker.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

const CALLERS = ['Dean Black', 'Randy Dibble']
const CUERS = ['Julie Stiers']

// The toggle and panel placed apart, as the Staff Schedule page does (the toggle
// in the filter row, the panel below it), with something else between them.
function Harness({
  callers = CALLERS,
  cuers = CUERS,
  selected = [],
  onChange = () => {},
}: {
  callers?: string[]
  cuers?: string[]
  selected?: string[]
  onChange?: (names: string[]) => void
}) {
  const { isOpen, setIsOpen, toggle, rootRef, toggleRef, portalRef } = useDismissableMenu<
    HTMLSpanElement,
    HTMLButtonElement,
    HTMLDivElement
  >()
  return (
    <>
      <StaffPickerToggle
        isOpen={isOpen}
        onToggle={toggle}
        panelId="staff-panel"
        rootRef={rootRef}
        toggleRef={toggleRef}
        callers={callers}
        cuers={cuers}
        selected={selected}
      />
      <p>Elsewhere on the page</p>
      <StaffPickerPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        overlay={false}
        panelId="staff-panel"
        panelRef={portalRef}
        callers={callers}
        cuers={cuers}
        selected={selected}
        onChange={onChange}
      />
    </>
  )
}

function toggleButton() {
  return screen.getByRole('button', { name: /Show more staff/ })
}

describe('StaffPicker', () => {
  it("opens to list the day's callers and cuers in their own sections", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(toggleButton()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group', { name: 'Callers' })).not.toBeInTheDocument()

    await user.click(toggleButton())
    expect(toggleButton()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('group', { name: 'Callers' })).toHaveTextContent('Dean BlackRandy Dibble')
    expect(screen.getByRole('group', { name: 'Cuers' })).toHaveTextContent('Julie Stiers')
  })

  it('adds and removes a name, keeping picks from other days', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<Harness selected={['Someone Thursday']} onChange={onChange} />)
    await user.click(toggleButton())
    await user.click(screen.getByRole('checkbox', { name: 'Randy Dibble' }))
    expect(onChange).toHaveBeenLastCalledWith(['Someone Thursday', 'Randy Dibble'])

    rerender(<Harness selected={['Someone Thursday', 'Randy Dibble']} onChange={onChange} />)
    await user.click(screen.getByRole('checkbox', { name: 'Randy Dibble' }))
    expect(onChange).toHaveBeenLastCalledWith(['Someone Thursday'])
  })

  it("counts only this day's picks, and clears just those", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness selected={['Someone Thursday', 'Dean Black', 'Julie Stiers']} onChange={onChange} />)
    expect(toggleButton()).toHaveTextContent('Show more staff (2)')
    await user.click(toggleButton())
    await user.click(screen.getByRole('button', { name: 'Featured staff only' }))
    expect(onChange).toHaveBeenLastCalledWith(['Someone Thursday'])
  })

  it('closes on a tap outside the button and panel, or on Escape, but not on a tap inside the panel', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(toggleButton())

    fireEvent.pointerDown(screen.getByRole('group', { name: 'Callers' }))
    expect(screen.getByRole('group', { name: 'Callers' })).toBeInTheDocument()

    // A real tap is pointerdown then click; the hook swallows that click, so
    // fire both, or the swallow stays pending and eats the next click below.
    fireEvent.pointerDown(screen.getByText('Elsewhere on the page'))
    fireEvent.click(screen.getByText('Elsewhere on the page'))
    expect(screen.queryByRole('group', { name: 'Callers' })).not.toBeInTheDocument()

    await user.click(toggleButton())
    expect(screen.getByRole('group', { name: 'Callers' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Callers' })).not.toBeInTheDocument()
    expect(toggleButton()).toHaveFocus()
  })

  it('closes with its ✕ button', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(toggleButton())
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('group', { name: 'Callers' })).not.toBeInTheDocument()
    expect(toggleButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders nothing when nobody else is on the day', () => {
    const { container } = render(<Harness callers={[]} cuers={[]} />)
    expect(container).toHaveTextContent('Elsewhere on the page')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
