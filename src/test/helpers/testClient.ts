import { createHttpClient, createRequestLogStore, type HttpClientConfig } from '@/lib/http'
import { armToken, graphToken, TEST_SUB, TEST_TENANT } from './fakeJwt'

/**
 * An HTTP client with fictional tokens and its own request log, for service tests. Requests go to
 * the MSW handlers; retries don't wait.
 */
export function testClient(overrides: Partial<HttpClientConfig> = {}) {
  const tokens = { arm: armToken(), graph: graphToken() }
  const log = createRequestLogStore()
  const client = createHttpClient({
    getToken: (api) => tokens[api],
    getMaskValues: () => ({ subscriptionId: TEST_SUB, tenantId: TEST_TENANT }),
    logger: log.getState(),
    sleep: () => Promise.resolve(),
    ...overrides,
  })
  return { client, log }
}
