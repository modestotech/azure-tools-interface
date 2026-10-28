import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'

/** Extra setup for the jsdom project: DOM matchers and unmounting rendered components. */

/*
 * findBy* and waitFor give up after 1 s by default. Under a full parallel run, elkjs layout (on
 * the main thread) and the first MSW round trips can take longer, which made tests flaky. This
 * stays below Vitest's 5 s test timeout, so a missing element still fails with the DOM dump.
 */
configure({ asyncUtilTimeout: 4000 })

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
