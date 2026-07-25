import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

afterEach(cleanup)

// jsdom doesn't implement ResizeObserver — needed by @radix-ui/react-slider (via
// react-use-size) to measure the track/thumb, even though tests never assert on
// real layout/pixel positions.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver
