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

// jsdom doesn't implement IntersectionObserver — needed by useIsElementVisible
// (ScrollToTopButton). This default never fires; a test that needs to simulate a
// visibility change should stub globalThis.IntersectionObserver itself, scoped to
// that test file, rather than relying on this one.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof IntersectionObserver

// jsdom doesn't implement matchMedia — needed by ScrollToTopButton's
// prefers-reduced-motion check. Defaults to "no match" (motion not reduced);
// override per-test with vi.spyOn(window, 'matchMedia') to simulate the opposite.
globalThis.matchMedia ??=
  ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
