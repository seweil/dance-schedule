import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  it('renders the home page generated from content/index.md', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /welcome to dance schedule/i })).toBeInTheDocument()
  })

  it('renders the nav generated from content/ file structure', () => {
    render(<App />)
    expect(screen.getByRole('navigation', { name: /site navigation/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /installation/i })).toBeInTheDocument()
  })

  it('redirects an unknown path to home instead of rendering blank', () => {
    window.history.pushState({}, '', '/no-such-page')
    render(<App />)
    expect(screen.getByRole('heading', { name: /welcome to dance schedule/i })).toBeInTheDocument()
  })
})
