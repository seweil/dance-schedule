import { afterEach, describe, expect, it } from 'vitest'
import { mailtoAddress, withDiagnostics } from './mailtoDiagnostics'

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

describe('withDiagnostics', () => {
  afterEach(() => {
    setNavigatorOnLine(true)
  })

  it('leaves a non-mailto: href unchanged', () => {
    expect(withDiagnostics('https://example.com')).toBe('https://example.com')
  })

  it('appends a build + client diagnostics block to a bare mailto: href', () => {
    const result = withDiagnostics('mailto:help@sqdance.app')
    expect(result).toMatch(/^mailto:help@sqdance\.app\?body=/)

    const body = decodeURIComponent(new URLSearchParams(result.split('?')[1]).get('body') ?? '')
    expect(body).toContain('Details:')
    expect(body).toContain('Page: ')
    expect(body).toMatch(/Build \S+ at /)
    expect(body).toContain(navigator.userAgent)
  })

  it('reports "Online" while online and "Offline" while offline', () => {
    setNavigatorOnLine(false)
    const body = decodeURIComponent(
      new URLSearchParams(withDiagnostics('mailto:help@sqdance.app').split('?')[1]).get('body') ?? '',
    )
    expect(body).toContain('Offline')
  })

  it('preserves an existing subject and prepends diagnostics after any existing body', () => {
    const result = withDiagnostics('mailto:help@sqdance.app?subject=Bug&body=Steps%20to%20reproduce%3A')
    const params = new URLSearchParams(result.split('?')[1])
    expect(params.get('subject')).toBe('Bug')
    expect(decodeURIComponent(params.get('body') ?? '')).toMatch(/^Steps to reproduce:\n\n---/)
  })

  it('encodes the body with %20, not "+", so spaces survive in mail clients that read "+" literally', () => {
    const result = withDiagnostics('mailto:help@sqdance.app')
    expect(result).not.toContain('+')
  })

  it('uses bare \\n, not \\r\\n, for line breaks — macOS/iOS Mail renders %0D%0A as a literal "<BR>"', () => {
    const result = withDiagnostics('mailto:help@sqdance.app')
    expect(result).not.toContain('%0D')
  })
})

describe('mailtoAddress', () => {
  it('returns the bare address from a mailto: href with no query string', () => {
    expect(mailtoAddress('mailto:help@sqdance.app')).toBe('help@sqdance.app')
  })

  it('strips off any query string', () => {
    expect(mailtoAddress('mailto:help@sqdance.app?subject=Bug&body=hi')).toBe('help@sqdance.app')
  })
})
