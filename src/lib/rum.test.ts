import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const recordEventMock = vi.fn()
// A real `function`, not an arrow/`.mockImplementation`, so `new AwsRumMock(...)`
// behaves like an actual constructor call.
const AwsRumMock = vi.fn(function (this: {
  recordEvent: typeof recordEventMock
}) {
  this.recordEvent = recordEventMock
})
vi.mock('aws-rum-web', () => ({ AwsRum: AwsRumMock }))

// initRum stores its AwsRum instance in module-level state, so each test
// re-imports a fresh module instance rather than relying on test order to
// keep that state predictable.
let initRum: typeof import('./rum').initRum
let trackEvent: typeof import('./rum').trackEvent

beforeEach(async () => {
  vi.resetModules()
  ;({ initRum, trackEvent } = await import('./rum'))
})

afterEach(() => {
  AwsRumMock.mockClear()
  recordEventMock.mockClear()
  vi.unstubAllEnvs()
})

function stubProdEnv() {
  vi.stubEnv('PROD', true)
  vi.stubEnv('VITE_RUM_APP_MONITOR_ID', 'app-id')
  vi.stubEnv('VITE_RUM_IDENTITY_POOL_ID', 'pool-id')
  vi.stubEnv('VITE_RUM_REGION', 'us-east-2')
}

describe('initRum', () => {
  it('does nothing outside a production build', () => {
    stubProdEnv()
    vi.stubEnv('PROD', false)

    expect(() => initRum()).not.toThrow()
    expect(AwsRumMock).not.toHaveBeenCalled()
  })

  it('does nothing in production when the RUM env vars are unset', () => {
    vi.stubEnv('PROD', true)

    expect(() => initRum()).not.toThrow()
    expect(AwsRumMock).not.toHaveBeenCalled()
  })

  it('initializes AwsRum in production once every env var is set', () => {
    stubProdEnv()

    initRum()

    expect(AwsRumMock).toHaveBeenCalledWith(
      'app-id',
      __BUILD_NUMBER__,
      'us-east-2',
      expect.objectContaining({
        identityPoolId: 'pool-id',
        endpoint: 'https://dataplane.rum.us-east-2.amazonaws.com',
      }),
    )
  })

  it('never throws even if constructing AwsRum fails', () => {
    AwsRumMock.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    stubProdEnv()

    expect(() => initRum()).not.toThrow()
  })

  it('tags the session as "browser" by default (not installed)', () => {
    stubProdEnv()

    initRum()

    expect(AwsRumMock).toHaveBeenCalledWith(
      'app-id',
      __BUILD_NUMBER__,
      'us-east-2',
      expect.objectContaining({
        sessionAttributes: expect.objectContaining({ displayMode: 'browser' }),
      }),
    )
  })

  it('tags the session as "standalone" when running installed', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValueOnce({ matches: true } as MediaQueryList)
    stubProdEnv()

    initRum()

    expect(AwsRumMock).toHaveBeenCalledWith(
      'app-id',
      __BUILD_NUMBER__,
      'us-east-2',
      expect.objectContaining({
        sessionAttributes: expect.objectContaining({ displayMode: 'standalone' }),
      }),
    )
  })

  it('tags the session with isTablet from isTabletDevice()', () => {
    stubProdEnv()

    initRum()

    expect(AwsRumMock).toHaveBeenCalledWith(
      'app-id',
      __BUILD_NUMBER__,
      'us-east-2',
      expect.objectContaining({
        sessionAttributes: expect.objectContaining({ isTablet: expect.any(Boolean) }),
      }),
    )
  })
})

describe('trackEvent', () => {
  it('does nothing before initRum has been called', () => {
    expect(() => trackEvent('level_filter_change', { min: 0 })).not.toThrow()
    expect(recordEventMock).not.toHaveBeenCalled()
  })

  it('does nothing when initRum ran outside production', () => {
    vi.stubEnv('PROD', false)
    initRum()

    trackEvent('level_filter_change', { min: 0 })

    expect(recordEventMock).not.toHaveBeenCalled()
  })

  it('records the event once RUM is initialized', () => {
    stubProdEnv()
    initRum()

    trackEvent('level_filter_change', { min: 0, max: 7 })

    expect(recordEventMock).toHaveBeenCalledWith('level_filter_change', { min: 0, max: 7 })
  })

  it('never throws even if recordEvent fails', () => {
    stubProdEnv()
    initRum()
    recordEventMock.mockImplementationOnce(() => {
      throw new Error('boom')
    })

    expect(() => trackEvent('level_filter_change', { min: 0 })).not.toThrow()
  })
})
