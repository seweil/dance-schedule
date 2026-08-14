import { afterEach, describe, expect, it, vi } from 'vitest'

const AwsRumMock = vi.fn()
vi.mock('aws-rum-web', () => ({ AwsRum: AwsRumMock }))

const { initRum } = await import('./rum')

afterEach(() => {
  AwsRumMock.mockReset()
  vi.unstubAllEnvs()
})

describe('initRum', () => {
  it('does nothing outside a production build', () => {
    vi.stubEnv('PROD', false)
    vi.stubEnv('VITE_RUM_APP_MONITOR_ID', 'app-id')
    vi.stubEnv('VITE_RUM_IDENTITY_POOL_ID', 'pool-id')
    vi.stubEnv('VITE_RUM_REGION', 'us-east-2')

    expect(() => initRum()).not.toThrow()
    expect(AwsRumMock).not.toHaveBeenCalled()
  })

  it('does nothing in production when the RUM env vars are unset', () => {
    vi.stubEnv('PROD', true)

    expect(() => initRum()).not.toThrow()
    expect(AwsRumMock).not.toHaveBeenCalled()
  })

  it('initializes AwsRum in production once every env var is set', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_RUM_APP_MONITOR_ID', 'app-id')
    vi.stubEnv('VITE_RUM_IDENTITY_POOL_ID', 'pool-id')
    vi.stubEnv('VITE_RUM_REGION', 'us-east-2')

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
    AwsRumMock.mockImplementation(() => {
      throw new Error('boom')
    })
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_RUM_APP_MONITOR_ID', 'app-id')
    vi.stubEnv('VITE_RUM_IDENTITY_POOL_ID', 'pool-id')
    vi.stubEnv('VITE_RUM_REGION', 'us-east-2')

    expect(() => initRum()).not.toThrow()
  })
})
