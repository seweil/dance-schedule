import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetAppState } from './resetAppState'

function mockLocation() {
  const location = { href: '' } as unknown as Location
  vi.spyOn(window, 'location', 'get').mockReturnValue(location)
  return location
}

function mockServiceWorker(overrides: {
  getRegistration?: () => Promise<unknown>
  addEventListener?: (event: string, callback: () => void) => void
}) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      ...overrides,
    },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('resetAppState', () => {
  it('clears storage and navigates to the app root when there is no service worker at all', async () => {
    const location = mockLocation()
    localStorage.setItem('some-key', 'some-value')

    await resetAppState()

    expect(localStorage.length).toBe(0)
    expect(location.href).toBe(import.meta.env.BASE_URL)
  })

  it('clears storage and navigates even when there is no registration', async () => {
    const location = mockLocation()
    mockServiceWorker({ getRegistration: vi.fn().mockResolvedValue(undefined) })
    localStorage.setItem('some-key', 'some-value')

    await resetAppState()

    expect(localStorage.length).toBe(0)
    expect(location.href).toBe(import.meta.env.BASE_URL)
  })

  it('checks for an update and still resets when nothing is waiting to activate', async () => {
    const location = mockLocation()
    const update = vi.fn().mockResolvedValue(undefined)
    mockServiceWorker({
      getRegistration: vi.fn().mockResolvedValue({ update, waiting: null, installing: null }),
    })
    localStorage.setItem('some-key', 'some-value')

    await resetAppState()

    expect(update).toHaveBeenCalledTimes(1)
    expect(localStorage.length).toBe(0)
    expect(location.href).toBe(import.meta.env.BASE_URL)
  })

  it('does not throw when registration.update() rejects, and still resets', async () => {
    const location = mockLocation()
    mockServiceWorker({
      getRegistration: vi
        .fn()
        .mockResolvedValue({ update: vi.fn().mockRejectedValue(new Error('offline')), waiting: null, installing: null }),
    })
    localStorage.setItem('some-key', 'some-value')

    await expect(resetAppState()).resolves.toBeUndefined()
    expect(localStorage.length).toBe(0)
    expect(location.href).toBe(import.meta.env.BASE_URL)
  })

  it('posts SKIP_WAITING to a waiting worker and resets once the browser activates it', async () => {
    const location = mockLocation()
    let controllerChangeListener: (() => void) | undefined
    const postMessage = vi.fn(() => controllerChangeListener?.())
    const update = vi.fn().mockResolvedValue(undefined)
    mockServiceWorker({
      getRegistration: vi.fn().mockResolvedValue({ update, waiting: { postMessage }, installing: null }),
      addEventListener: vi.fn((event, callback) => {
        if (event === 'controllerchange') controllerChangeListener = callback
      }),
    })
    localStorage.setItem('some-key', 'some-value')

    await resetAppState()

    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(localStorage.length).toBe(0)
    expect(location.href).toBe(import.meta.env.BASE_URL)
  })

  it('still resets within a bounded time even if the update check hangs forever', async () => {
    vi.useFakeTimers()
    const location = mockLocation()
    mockServiceWorker({
      // Never resolves — simulates the live Safari hang this timeout guards
      // against (see this module's own comment).
      getRegistration: vi.fn().mockReturnValue(new Promise(() => {})),
    })
    localStorage.setItem('some-key', 'some-value')

    const resetPromise = resetAppState()
    await vi.advanceTimersByTimeAsync(5_000)
    await resetPromise

    expect(localStorage.length).toBe(0)
    expect(location.href).toBe(import.meta.env.BASE_URL)
  })
})
