import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'

/** Extra setup for the jsdom project: DOM matchers and unmounting rendered components. */

/*
 * Browser APIs jsdom lacks, used by Radix Popover (positioning) and cmdk (keeping the active item
 * in view). They do nothing here; layout isn't what these tests check.
 */
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!('ResizeObserver' in globalThis)) {
  Object.assign(globalThis, { ResizeObserver: NoopResizeObserver })
}
const MISSING_ELEMENT_METHODS = {
  scrollIntoView: () => undefined,
  hasPointerCapture: () => false,
  releasePointerCapture: () => undefined,
}
for (const [name, value] of Object.entries(MISSING_ELEMENT_METHODS)) {
  if (!(name in Element.prototype)) {
    Object.defineProperty(Element.prototype, name, { value, configurable: true })
  }
}

afterEach(() => {
  cleanup()
})
