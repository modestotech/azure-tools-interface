import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'

/** Extra setup for the jsdom project: DOM matchers and unmounting rendered components. */

afterEach(() => {
  cleanup()
})
