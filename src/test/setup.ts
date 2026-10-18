import { clearSession } from '@/app/session/clearSession'
import { server } from './msw/server'

/** Runs for every test file, in both the node and the jsdom project. */

beforeAll(() => {
  // Any request without a handler fails the test, so nothing can reach real Azure.
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach(() => {
  server.resetHandlers()
  // The session store, request log and HTTP client are app-wide singletons. Wipe them after every
  // test, the same way the "Clear session" button does, so no state leaks between tests.
  clearSession()
})
afterAll(() => {
  server.close()
})
