import { afterEach, describe, expect, it } from 'vitest'
import { isTabletDevice } from './deviceFormFactor'

function stubNavigator(overrides: { userAgent?: string; platform?: string; maxTouchPoints?: number }) {
  if (overrides.userAgent !== undefined) {
    Object.defineProperty(navigator, 'userAgent', { value: overrides.userAgent, configurable: true })
  }
  if (overrides.platform !== undefined) {
    Object.defineProperty(navigator, 'platform', { value: overrides.platform, configurable: true })
  }
  if (overrides.maxTouchPoints !== undefined) {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: overrides.maxTouchPoints, configurable: true })
  }
}

const REAL_USER_AGENT = navigator.userAgent
const REAL_PLATFORM = navigator.platform
const REAL_MAX_TOUCH_POINTS = navigator.maxTouchPoints

afterEach(() => {
  stubNavigator({
    userAgent: REAL_USER_AGENT,
    platform: REAL_PLATFORM,
    maxTouchPoints: REAL_MAX_TOUCH_POINTS,
  })
})

describe('isTabletDevice', () => {
  it('is true when the user agent explicitly says iPad', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPad',
      maxTouchPoints: 5,
    })

    expect(isTabletDevice()).toBe(true)
  })

  it('is true for an iPad reporting as Mac (iPadOS 13+ default desktop UA)', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    })

    expect(isTabletDevice()).toBe(true)
  })

  it('is false for a real Mac (MacIntel with no touch support)', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })

    expect(isTabletDevice()).toBe(false)
  })

  it('is true for an Android tablet (no "Mobile" token)', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    })

    expect(isTabletDevice()).toBe(true)
  })

  it('is false for an Android phone (has the "Mobile" token)', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    })

    expect(isTabletDevice()).toBe(false)
  })

  it('is false for an iPhone', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })

    expect(isTabletDevice()).toBe(false)
  })

  it('is false for desktop Windows', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0',
      platform: 'Win32',
      maxTouchPoints: 0,
    })

    expect(isTabletDevice()).toBe(false)
  })
})
