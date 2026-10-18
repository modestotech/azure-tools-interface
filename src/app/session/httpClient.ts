import { createHttpClient, requestLogStore } from '@/lib/http'
import { sessionStore, sessionToken } from './sessionStore'

/**
 * The app's single HTTP client, wired to the in-memory session and the request log.
 *
 * It lives in `app/` because it reads the session store. Lower layers never import it: services
 * take an `HttpClient` as a parameter (layering is one-way, `views → domain → services → lib`),
 * and the app shell passes this instance in. Tests pass their own client.
 */
export const httpClient = createHttpClient({
  getToken: (api) => sessionToken(sessionStore.getState(), api),
  getMaskValues: () => {
    const { subscriptionId, tenantId } = sessionStore.getState()
    return { subscriptionId, tenantId }
  },
  logger: requestLogStore.getState(),
})
