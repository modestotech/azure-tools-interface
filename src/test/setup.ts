import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { server } from './msw/server'

beforeAll(() => {
  // Any request without a handler fails the test, so nothing can reach real Azure.
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => {
  server.close()
})
