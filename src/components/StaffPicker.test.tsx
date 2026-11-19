import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('renders nothing when nobody else is on the day', () => {
    const { container } = render(<StaffPicker callers={[]} cuers={[]} selected={[]} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
