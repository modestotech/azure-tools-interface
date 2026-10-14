import { createHttpClient, requestLogStore } from '@/lib/http'
import { sessionStore, tokenFor } from './sessionStore'

/** The app's single HTTP client, wired to the in-memory session and the request log. */
export const httpClient = createHttpClient({
  getToken: (api) => tokenFor(sessionStore.getState(), api),
  getMaskValues: () => {
    const { subscriptionId, tenantId } = sessionStore.getState()
    return { subscriptionId, tenantId }
  },
  logger: requestLogStore.getState(),
})

/**
 * "Clear session": forgets tokens and IDs, and the request log (its raw URLs contain the IDs).
 * M4 also clears the TanStack Query cache here.
 */
export function clearSession(): void {
  sessionStore.getState().reset()
  requestLogStore.getState().clear()
}
