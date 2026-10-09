import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleStaleChunkError } from './staleChunkReload'

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }))
vi.mock('./rum', () => ({ trackEvent }))

function preloadError(): Event {
  const event = new Event('vite:preloadError', { cancelable: true })
  Object.assign(event, { payload: new Error('Failed to fetch dynamically imported module: /assets/home-old.js') })
  return event
}

describe('handleStaleChunkError', () => {
  beforeEach(() => {
    sessionStorage.clear()
    trackEvent.mockClear()
  })

  it('reloads once, suppresses the error, and records a RUM event', () => {
    const reload = vi.fn()
    const event = preloadError()

    handleStaleChunkError(event, sessionStorage, reload, 1_000_000)

    expect(reload).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
    expect(trackEvent).toHaveBeenCalledWith('stale_chunk_reload', {
      message: 'Failed to fetch dynamically imported module: /assets/home-old.js',
    })
  })

  it('does not reload again within the guard window, letting the error propagate', () => {
    const reload = vi.fn()
    handleStaleChunkError(preloadError(), sessionStorage, reload, 1_000_000)

    const second = preloadError()
    handleStaleChunkError(second, sessionStorage, reload, 1_005_000)

    expect(reload).toHaveBeenCalledOnce()
    expect(second.defaultPrevented).toBe(false)
  })

  it('reloads again once the guard window has passed', () => {
    const reload = vi.fn()
    handleStaleChunkError(preloadError(), sessionStorage, reload, 1_000_000)
    handleStaleChunkError(preloadError(), sessionStorage, reload, 1_011_000)

    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload while offline, letting the error propagate', () => {
    const reload = vi.fn()
    const event = preloadError()

    handleStaleChunkError(event, sessionStorage, reload, 1_000_000, false)

    expect(reload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    expect(sessionStorage.getItem('staleChunkReloadAt')).toBeNull()
  })

  it('does not reload when storage is unavailable', () => {
    const reload = vi.fn()
    const brokenStorage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    } as unknown as Storage
    const event = preloadError()

    handleStaleChunkError(event, brokenStorage, reload, 1_000_000)

    expect(reload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})
