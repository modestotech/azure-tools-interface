import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { clearSession } from '@/app/session/clearSession'
import { server } from './msw/server'

beforeAll(() => {
  // Any request without a handler fails the test, so nothing can reach real Azure.
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach(() => {
  server.resetHandlers()
  cleanup()
  // The session store, request log and HTTP client are app-wide singletons. Wipe them after every
  // test, the same way the "Clear session" button does, so no state leaks between tests.
  clearSession()
})
afterAll(() => {
  server.close()
})
