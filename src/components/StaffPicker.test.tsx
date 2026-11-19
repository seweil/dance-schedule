import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StaffPicker } from './StaffPicker'

vi.mock('./StaffPicker.module.css', () => ({
  default: new Proxy({}, { get: (_target, prop) => prop }) as Record<string, string>,
}))

const CALLERS = ['Dean Black', 'Randy Dibble']
const CUERS = ['Julie Stiers']

describe('StaffPicker', () => {
  it("lists the day's callers and cuers in their own sections", () => {
    render(<StaffPicker callers={CALLERS} cuers={CUERS} selected={[]} onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Callers' })).toHaveTextContent('Dean BlackRandy Dibble')
    expect(screen.getByRole('group', { name: 'Cuers' })).toHaveTextContent('Julie Stiers')
  })

  it('adds and removes a name, keeping picks from other days', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <StaffPicker callers={CALLERS} cuers={CUERS} selected={['Someone Thursday']} onChange={onChange} />,
    )
    await user.click(screen.getByText('Show more staff'))
    await user.click(screen.getByRole('checkbox', { name: 'Randy Dibble' }))
    expect(onChange).toHaveBeenLastCalledWith(['Someone Thursday', 'Randy Dibble'])

    rerender(
      <StaffPicker
        callers={CALLERS}
        cuers={CUERS}
        selected={['Someone Thursday', 'Randy Dibble']}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByRole('checkbox', { name: 'Randy Dibble' }))
    expect(onChange).toHaveBeenLastCalledWith(['Someone Thursday'])
  })

  it("counts only this day's picks, and clears just those", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <StaffPicker
        callers={CALLERS}
        cuers={CUERS}
        selected={['Someone Thursday', 'Dean Black', 'Julie Stiers']}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByText('Show more staff (2)'))
    await user.click(screen.getByRole('button', { name: 'Featured staff only' }))
    expect(onChange).toHaveBeenLastCalledWith(['Someone Thursday'])
  })

  it('closes on a tap outside it or on Escape, but not on a tap inside it', async () => {
    const user = userEvent.setup()
    render(
      <>
        <p>Elsewhere on the page</p>
        <StaffPicker callers={CALLERS} cuers={CUERS} selected={[]} onChange={() => {}} />
      </>,
    )
    const details = screen.getByText('Show more staff').closest('details')!
    await user.click(screen.getByText('Show more staff'))
    expect(details).toHaveAttribute('open')

    fireEvent.pointerDown(screen.getByRole('group', { name: 'Callers' }))
    expect(details).toHaveAttribute('open')

    // A real tap is pointerdown then click; the hook swallows that click, so
    // fire both, or the swallow stays pending and eats the next click below.
    fireEvent.pointerDown(screen.getByText('Elsewhere on the page'))
    fireEvent.click(screen.getByText('Elsewhere on the page'))
    expect(details).not.toHaveAttribute('open')

    await user.click(screen.getByText('Show more staff'))
    expect(details).toHaveAttribute('open')
    await user.keyboard('{Escape}')
    expect(details).not.toHaveAttribute('open')
  })

  it('renders nothing when nobody else is on the day', () => {
    const { container } = render(<StaffPicker callers={[]} cuers={[]} selected={[]} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
